/* Склейка отдельных каналов-тарифов в один канал с несколькими планами (логика: src/lib/merge-channel-plans.ts).
   По умолчанию — сухой прогон (ничего не пишет, печатает что сделает). `--apply` — записать в БД (DATABASE_URL из окружения / .env).

   Пример (случай владельца: «Торговые сигналы: Месяц» — корень, «Торговые сигналы: Неделя» — план):
     npx tsx scripts/merge-channel-plans.ts --root <idКорня> --plan <idНедели> --rename "Торговые сигналы"
     npx tsx scripts/merge-channel-plans.ts --root <idКорня> --plan <idНедели> --rename "Торговые сигналы" --apply

   Флаги:
     --root <id>             канал, который останется (его чат, slug, описание, посты, подписчики)
     --plan <id>             канал, который становится планом корня (можно несколько раз: --plan a --plan b)
     --rename "<Имя>"        новое имя канала (по умолчанию часть имени корня до «: »)
     --root-plan-name "<Имя>" название плана корня (по умолчанию суффикс его старого имени, напр. «Месяц»)
     --plan-name <id>=<Имя>  название плана (по умолчанию суффикс старого имени, напр. «Неделя»); можно несколько раз
     --merge-duplicates      у подписчиков, оплативших оба тарифа, объединить строки (остаётся самая поздняя, к ней добавляется остаток второй)
     --apply                 записать изменения
   Ничего не удаляется; повторный запуск безопасен. Прод-БД трогайте только осознанно: сначала сухой прогон. */

import { PrismaClient } from "@prisma/client";
import { mergeChannelPlans } from "../src/lib/merge-channel-plans";

function parseArgs(argv: string[]) {
  const o = { rootByName: "", planByName: [] as string[], rootId: "", planIds: [] as string[], rename: null as string | null, rootPlanName: null as string | null, planNames: {} as Record<string, string>, mergeDuplicates: false, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? "";
    if (a === "--root-by-name") o.rootByName = next();
    else if (a === "--plan-by-name") o.planByName.push(next());
    else if (a === "--root") o.rootId = next();
    else if (a === "--plan") o.planIds.push(next());
    else if (a === "--rename") o.rename = next();
    else if (a === "--root-plan-name") o.rootPlanName = next();
    else if (a === "--plan-name") {
      const [id, ...rest] = next().split("=");
      if (id && rest.length) o.planNames[id] = rest.join("=");
    } else if (a === "--merge-duplicates") o.mergeDuplicates = true;
    else if (a === "--apply") o.apply = true;
    else {
      console.error(`неизвестный флаг: ${a}`);
      process.exit(2);
    }
  }
  return o;
}

async function main() {
  try {
    (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    /* .env is optional: DATABASE_URL may already be in the environment */
  }
  const o = parseArgs(process.argv.slice(2));
  // ids are error-prone to copy by hand: channels can be named instead (exact name; must match exactly one channel)
  if (o.rootByName || o.planByName.length) {
    const pr = new PrismaClient();
    try {
      const find = async (name: string) => {
        const rows = await pr.subscriptionTariff.findMany({ where: { name }, select: { id: true } });
        if (rows.length !== 1) throw new Error(`канал «${name}»: найдено ${rows.length}, нужно ровно 1`);
        return rows[0].id;
      };
      if (o.rootByName) o.rootId = await find(o.rootByName);
      for (const n of o.planByName) o.planIds.push(await find(n));
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(2);
    } finally {
      await pr.$disconnect();
    }
  }
  if (!o.rootId || o.planIds.length === 0) {
    console.error('нужно: --root <id> --plan <id> [--plan <id>...] [--rename "Имя"] [--apply]');
    process.exit(2);
  }
  const db = new PrismaClient();
  try {
    const r = await mergeChannelPlans(db, { rootId: o.rootId, planIds: o.planIds, rename: o.rename, rootPlanName: o.rootPlanName, planNames: o.planNames, mergeDuplicates: o.mergeDuplicates }, o.apply);
    console.log(o.apply ? "РЕЖИМ: --apply (запись)" : "РЕЖИМ: сухой прогон (ничего не записано; добавьте --apply)");
    if (r.errors.length) {
      console.error("ОШИБКИ:\n - " + r.errors.join("\n - "));
      process.exitCode = 1;
      return;
    }
    console.log(`Канал: «${r.root!.oldName}» -> «${r.root!.newName}», его собственный план: «${r.root!.planName}»`);
    for (const p of r.plans) {
      console.log(
        `План ${p.planId}: «${p.oldName}» -> «${p.newName}»${p.alreadyMerged ? " (уже склеен)" : ""}\n` +
          `   подписок: ${p.subscriptions} (активных ${p.activeSubscriptions}) - остаются на строке плана, доступ по семье канала\n` +
          `   постов переезжает на канал: ${p.ideas}\n` +
          `   чат: ${p.roomAction === "none" ? "комнаты нет" : p.roomAction === "root-takes-room" ? `у канала нет чата - забирает комнату плана (${p.chatMessages} сообщ.)` : `${p.chatMessages} сообщ. переносятся в чат канала, старая комната архивируется`}\n` +
          `   slug плана ${p.slug ? `«${p.slug}» освобождается` : "не было"}`
      );
    }
    if (r.duplicates.length) {
      console.log(`Подписчики с активными строками на нескольких планах: ${r.duplicates.length}${o.mergeDuplicates ? " - будут объединены" : " - без --merge-duplicates остаются как есть (доступ работает, в списке показан один раз)"}`);
      for (const d of r.duplicates) console.log(`   ${d.subscriberId}: ${d.rows} строк`);
    }
    console.log(r.applied ? "Готово: изменения записаны." : "Сухой прогон завершён.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
