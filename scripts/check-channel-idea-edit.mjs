// Offline checks of the actual editor, submit handler and HTTP handlers.
// No database, account credentials, payments or publications are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = process.cwd();
function load(file, mocks) {
  const filename = path.join(root, file), mod = { exports: {} };
  const req = createRequire(filename);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(
    name => Object.hasOwn(mocks, name) ? mocks[name] : req(name), mod, mod.exports);
  return mod.exports;
}
let states = [], index = 0, effects = [], first = true;
const hooks = {
  useState(initial) {
    const i = index++;
    if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
    return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
  },
  useEffect(fn) { if (first) effects.push(fn); },
  useRef: () => ({ current: null }), useCallback: fn => fn,
};
const navigate = [], saved = [], session = { user: { id: 'owner', role: 'USER' } };
const common = {
  react: { ...React, ...hooks },
  'next/navigation': { useRouter: () => ({ push: url => navigate.push(url) }), useParams: () => ({ id: 'idea' }) },
  '@/lib/i18n/client': { useT: () => ({ t: key => key }) },
  '@/components/ui/EmojiPicker': { __esModule: true, default: () => null },
  '@/components/app/useUnsavedGuard': { useUnsavedGuard: () => ({ release() {} }) },
  '@/lib/large-upload-client': { SMALL_MB: 10 },
};
const Form = load('src/components/ideas/IdeaForm.tsx', common).default;
const draft = { title: 'Channel article', preview: 'Original preview', content: 'Original article',
  isPaid: true, price: 100, instrumentIds: [], attachments: [], acceptDonations: false };
globalThis.fetch = async (url, options) => {
  if (options) { saved.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ id: 'idea' }) }; }
  return { ok: true, json: async () => ({ ...draft, channel: { id: 'channel' }, author: session.user, instruments: [] }) };
};
const Page = load('src/app/(main)/ideas/[id]/edit/page.tsx', {
  ...common, 'next-auth/react': { useSession: () => ({ data: session }) },
  '@/components/ideas/IdeaForm': { __esModule: true, default: Form },
}).default;
function find(tree, match) {
  if (!tree || typeof tree !== 'object') return null;
  if (match(tree)) return tree;
  return React.Children.toArray(tree.props?.children).map(child => find(child, match)).find(Boolean);
}
Page(); effects.forEach(fn => fn());
await new Promise(resolve => setImmediate(resolve));
index = 0; first = false;
const page = Page(), formProps = find(page, el => el.type === Form).props;
assert.equal(formProps.channelId, 'channel', 'editing must retain the stored channel');
states = []; index = 0;
const channelForm = Form(formProps), html = renderToStaticMarkup(channelForm);
assert(!html.includes('idea.paid') && !html.includes('idea.priceRub') && !html.includes('idea.acceptDonations'));
await find(channelForm, el => el.type === 'form').props.onSubmit({ preventDefault() {} });
assert.equal(saved[0].preview, draft.preview, 'editing must preserve the original preview');
assert.equal(saved[0].isPaid, true, 'channel content must remain restricted');
assert(!('price' in saved[0]) && !('channelId' in saved[0]), 'edit must not sell or move the post');
states = []; index = 0;
assert(renderToStaticMarkup(Form({ mode: 'edit', initialData: draft })).includes('idea.priceRub'), 'standalone sales remain available');

let stored = { ...draft, id: 'idea', authorId: 'owner', tariffId: 'channel', moderationStatus: 'published',
  author: { id: 'owner' }, tariff: { id: 'channel', name: 'Channel' }, votes: [], instruments: [] };
let caller = session;
const writes = [], prisma = {
  idea: { findUnique: async () => stored, update: async ({ data }) => { writes.push(data); stored = { ...stored, ...data }; return { id: 'idea' }; } },
  ideaInstrument: { deleteMany: async () => {}, createMany: async () => {} },
  purchase: { findUnique: async () => null }, subscription: { findFirst: async () => null },
  $transaction: async fn => fn(prisma),
};
const apiMocks = {
  '@/lib/auth': { auth: async () => caller }, '@/lib/prisma': { prisma },
  '@/lib/roles': { isAdmin: user => user.role === 'ADMIN' },
  '@/lib/tariff-plans': { familyOfTariff: async () => ['channel'] },
  '@/lib/upload-cleanup': { ideaUploadUrls: () => [], removeIdeaUploads() {} }, '@/lib/idea-delete': {},
};
const route = load('src/app/api/ideas/[id]/route.ts', apiMocks);
const context = { params: Promise.resolve({ id: 'idea' }) };
const patch = body => route.PATCH({ json: async () => body }, context);
assert.equal((await patch({ ...saved[0], price: 100, isPaid: false, acceptDonations: true })).status, 200);
assert.deepEqual([stored.tariffId, stored.isPaid, stored.price, stored.acceptDonations], ['channel', true, null, false]);
assert.equal((await patch({ title: 'Legacy editor', price: 0 })).status, 200, 'legacy channel payload must not fail validation');
await patch({ isPinned: true });
assert(!('editedAt' in writes.at(-1)), 'pinning must not mark the article edited');
stored.price = 100;
assert.equal((await (await route.GET({}, context)).json()).price, null, 'legacy price must not be offered to readers');
caller = { user: { id: 'stranger', role: 'USER' } };
assert.equal((await patch({ title: 'Not yours' })).status, 403);
const locked = await (await route.GET({}, context)).json();
assert(locked.locked && !('content' in locked), 'channel subscription access must remain enforced');
caller = session; stored.tariffId = null;
assert.equal((await patch({ isPaid: true, price: 250 })).status, 200);
assert.equal(stored.price, 250, 'standalone prices still save');
assert.equal((await patch({ price: 0 })).status, 400, 'standalone validation remains enforced');

const payments = load('src/app/api/payments/route.ts', { ...apiMocks,
  '@/lib/notifications': {}, '@/lib/subscriptions': {}, '@/lib/subscription-renew': {}, '@/lib/author-pay-defaults': {},
  '@/lib/rate-limit': { rateLimit: async () => ({ allowed: true }) },
  '@/lib/i18n/server': { getT: async () => ({ t: key => key }) },
});
stored.tariffId = 'channel'; stored.price = 100;
assert.equal((await payments.POST({ json: async () => ({ ideaId: 'idea' }) })).status, 400,
  'even a legacy channel post with a price cannot be sold individually');
console.log('OK: channel edit UI, submit, PATCH/GET, access isolation and single-payment rejection; standalone sales preserved');
