import { PrismaClient } from '@prisma/client';
import IntegrationBase from './integration-base';
import { FileStateStore, InstallProvider } from '@slack/oauth';
import path from "node:path"
const prisma = new PrismaClient();

type TSlackStruct = {
  installer: null | InstallProvider;
};
class SlackIntegration extends IntegrationBase implements TSlackStruct {
  installer: null | InstallProvider;
  constructor() {
    super();
    this.installer = null;
  }


  get installation() {
    return this.installer
  }

  connect() {


    const installation = new InstallProvider({
      clientId: process.env.SLACK_CLIENT_ID as string,
      clientSecret: process.env.SLACK_CLIENT_SECRET as string,
      stateSecret: process.env.SLACK_STATE_SECRET,
      stateStore: new FileStateStore({ baseDir: path.resolve(__dirname, './state-store'), }),
      clientOptions: {
        slackApiUrl: 'https://slack.com/api',
        headers: {
          'Set-Cookie': 'slack-state=; Secure; SameSite=None; Path=/',
        },
      },
      installationStore: {
        // takes in an installation object as an argument
        // returns nothing
        storeInstallation: async (installation) => {
          // replace myDB.set with your own database or OEM setter
          if (installation.isEnterpriseInstall) {
            // support for org wide app installation
            await prisma.slackInstallation.create({
              data: {
                installationId: installation.enterprise?.id as string,
                installation: JSON.stringify(installation),
              },
            });
          } else {
            // single team app installation
            // return myDB.set(installation.team.id, installation);
            await prisma.slackInstallation.create({
              data: {
                installationId: installation.team?.id as string,
                installation: JSON.stringify(installation),
              },
            });
          }

        },

        fetchInstallation: async (installQuery) => {
          // replace myDB.get with your own database or OEM getter
          if (
            installQuery.isEnterpriseInstall &&
            installQuery.enterpriseId !== undefined
          ) {
            // org wide app installation lookup
            // return await myDB.get(installQuery.enterpriseId);
            const slackInstallation =
              await prisma.slackInstallation.findUnique({
                where: {
                  id: installQuery.enterpriseId,
                },
              });
            if (slackInstallation) {
              const installation = JSON.parse(slackInstallation.installation);
              return installation;
            }


          }
          if (installQuery.teamId !== undefined) {
            // single team app installation lookup
            const slackInstallation =
              await prisma.slackInstallation.findUnique({
                where: { id: installQuery.teamId },
              });
            if (slackInstallation) {
              const installation = JSON.parse(slackInstallation.installation);
              return installation;
            }
          }
          throw new Error('Failed fetching installation');
        },

        deleteInstallation: async (installQuery) => {
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
      },
    });

    // console.log(installation)
    this.installer = installation;

    return this;
  }

  disconnect(data: any): void {
    console.log(data);
  }

  recieveWebHook(): void {
    console.log('webhook recieved');
  }
}

export { SlackIntegration };
