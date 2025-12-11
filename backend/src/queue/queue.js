let queue = [];
let processing = false;

// Ajouter un job à la file
export function addPPTJob(jobFunction) {
    queue.push(jobFunction);
    processQueue();
}

// Traitement séquentiel
async function processQueue() {
    if (processing) return;        // Déjà en cours
    if (queue.length === 0) return; // File vide

    processing = true;

    const job = queue.shift();      // Récupère le premier job de la file

    try {
        await job();
    } catch (err) {
        console.error("Erreur lors d’un job PPT :", err);
    }

    processing = false;
    processQueue(); // Passe au suivant
}