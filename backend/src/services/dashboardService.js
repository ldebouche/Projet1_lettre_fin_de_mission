import fs from 'fs/promises';
import path from 'path';

export async function getHistorique(cheminBase) {
    const arborescence = {};

    try {
        const dossiersAnnees = await fs.readdir(cheminBase, { withFileTypes: true });

        for (const dossierAnnee of dossiersAnnees) {
            if (!dossierAnnee.isDirectory()) continue;

            const annee = dossierAnnee.name;
            arborescence[annee] = { DEPOT: [], RESTITUTION: [] };

            for (const type of ['DEPOT', 'RESTITUTION']) {
                const cheminType = path.join(cheminBase, annee, type);

                try {
                    const fichiers = await fs.readdir(cheminType, { withFileTypes: true });

                    for (const fichier of fichiers) {
                        if (!fichier.isFile()) continue;

                        arborescence[annee][type].push({
                            nom: fichier.name,
                            chemin: path.join(cheminType, fichier.name)
                        });
                    }
                } catch {
                    continue;
                }
            }
        }

        return arborescence;
    } catch {
        return {};
    }
}
