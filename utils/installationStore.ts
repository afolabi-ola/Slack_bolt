import { PrismaClient } from "@prisma/client";

const getInstallationStore = (prisma: PrismaClient) => {
    const installationStore = {
        // takes in an installation object as an argument
        // returns nothing
        storeInstallation: async (installation: any) => {
            // replace myDB.set with your own database or OEM setter
            if (installation.isEnterpriseInstall) {
                // support for org wide app installation

                await prisma.slackInstallation.create({
                    data: {
                        installationId: installation.enterprise?.id as string,
                        installation: JSON.stringify(installation),
                        connected: true
                    },
                });
            } else {
                // single team app installation
                // return myDB.set(installation.team.id, installation);
                await prisma.slackInstallation.create({
                    data: {
                        installationId: installation.team?.id as string,
                        installation: JSON.stringify(installation),
                        connected: true

                    },
                });
            }
        },

        fetchInstallation: async (installQuery: any) => {
            // replace myDB.get with your own database or OEM getter
            if (
                installQuery.isEnterpriseInstall &&
                installQuery.enterpriseId !== undefined
            ) {
                // org wide app installation lookup
                // return await myDB.get(installQuery.enterpriseId);
                const slackInstallation = await prisma.slackInstallation.findUnique({
                    where: {
                        installationId: installQuery.enterpriseId
                    },
                });

                if (slackInstallation) {
                    const installation = JSON.parse(slackInstallation.installation);
                    return installation;
                }
            }
            if (installQuery.teamId !== undefined) {
                // single team app installation lookup

                const slackInstallation = await prisma.slackInstallation.findUnique({
                    where: { id: installQuery.teamId },
                });

                if (slackInstallation) {
                    const installation = JSON.parse(slackInstallation.installation);
                    return installation;
                }
            }
            throw new Error("Failed fetching installation");
        },

        deleteInstallation: async (installQuery: any) => {
            // replace myDB.get with your own database or OEM getter
            if (
                installQuery.isEnterpriseInstall &&
                installQuery.enterpriseId !== undefined
            ) {
                // org wide app installation deletion
                // return await myDB.delete(installQuery.enterpriseId);
                await prisma.slackInstallation.delete({
                    where: { id: installQuery.enterpriseId },
                });
            }
            if (installQuery.teamId !== undefined) {
                // single team app installation deletion
                await prisma.slackInstallation.delete({
                    where: { id: installQuery.teamId },
                });
            }
        },
    };

    return installationStore
}

export default getInstallationStore