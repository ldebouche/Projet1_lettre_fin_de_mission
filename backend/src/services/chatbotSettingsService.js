import fs from "fs/promises";
import path from "path";
import { removePdfFromIndex, indexPdfFile } from "./chatbotRagService.js";

let idCounter = 1;

async function scanDirectory(directoryPath, parentId = null, currentRelativePath = '') {
    let items = [];
    try {
        const entries = await fs.readdir(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
            const currentId = idCounter++;
            const fullPath = path.join(directoryPath, entry.name);
            const relativePath = path.join(currentRelativePath, entry.name);

            const url = entry.isFile() ? `/api/files/${relativePath.replace(/\\/g, "/")}` : null;

            const item = {
                id: currentId,
                name: entry.name,
                isFolder: entry.isDirectory(),
                parentId: parentId,
                isExpanded: false,
                url: url,
                filePath: fullPath
            };
            items.push(item);

            if (entry.isDirectory()) {
                const children = await scanDirectory(fullPath, currentId, relativePath);
                items = items.concat(children);
            }
        }
    } catch (error) {
        console.error(`Erreur lors du scan du dossier ${directoryPath}:`, error);
    }
    return items;
}

export async function getFileTree() {
    idCounter = 1;
    const rootPath = path.join(process.cwd(), "documents_chatbot");
    return scanDirectory(rootPath);
}

export async function deleteItemFromIndexedItems(item, indexedItems) {
    if (!indexedItems.find(i => i.id === parseInt(item.id))) {
        throw new Error("Item not found");
    }

    if (!item.isFolder) {
        const relativePath = path
            .relative(path.join(process.cwd(), "documents_chatbot"), item.filePath)
            .replace(/\\/g, "/");

        removePdfFromIndex(relativePath);
    }

    await fs.rm(item.filePath, { recursive: true, force: true });
}

export async function createFolderToIndexedItems(folderName, parentId, indexedItems) {
    let parentPath = path.join(process.cwd(), "documents_chatbot");
    if (parentId !== null) {
        const parent = indexedItems.find(i => i.id === parentId);
        parentPath = parent.filePath;
    }
    const folderPath = path.join(parentPath, folderName);
    await fs.mkdir(folderPath);
}

export async function addFileToIndexedItems(files, targetFolder) {
    let targetPath = path.join(process.cwd(), "documents_chatbot");
    const folderObject = targetFolder ? JSON.parse(targetFolder) : null;
    if (folderObject && folderObject.filePath) {
        targetPath = folderObject.filePath;
    }
    for (const file of files) {
        const filePath = path.join(targetPath, file.originalname);
        await fs.writeFile(filePath, file.buffer);

        const relativePath = path
            .relative(path.join(process.cwd(), "documents_chatbot"), filePath)
            .replace(/\\/g, "/");

        await indexPdfFile(filePath, relativePath, file.originalname);
    }
}
