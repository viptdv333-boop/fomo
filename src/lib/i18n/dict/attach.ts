import type { SectionDict } from "./types";

// Attach (paperclip) bottom sheet in chats and comments.
const dict: SectionDict = {
  ru: {
    "attach.gallery": "Галерея",
    "attach.camera": "Камера",
    "attach.files": "Файлы (PDF, DOCX, TXT…)",
    "attach.clipboard": "Вставить из буфера обмена",
    "attach.clipboardEmpty": "В буфере обмена нет изображения",
    "attach.clipboardDenied": "Нет доступа к буферу обмена. Вставьте картинку долгим нажатием в поле ввода",
    "attach.cancel": "Отмена",
  },
  en: {
    "attach.gallery": "Gallery",
    "attach.camera": "Camera",
    "attach.files": "Files (PDF, DOCX, TXT…)",
    "attach.clipboard": "Paste from clipboard",
    "attach.clipboardEmpty": "No image in the clipboard",
    "attach.clipboardDenied": "Clipboard access denied. Long-press the input field and paste the image",
    "attach.cancel": "Cancel",
  },
  cn: {
    "attach.gallery": "相册",
    "attach.camera": "相机",
    "attach.files": "文件（PDF、DOCX、TXT…）",
    "attach.clipboard": "从剪贴板粘贴",
    "attach.clipboardEmpty": "剪贴板中没有图片",
    "attach.clipboardDenied": "无法访问剪贴板，请长按输入框粘贴图片",
    "attach.cancel": "取消",
  },
};
export default dict;
