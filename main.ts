import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { config } from "dotenv";

import { PrismaClient } from "@prisma/client";
import cors from "cors"
import amqp from "amqplib"

config();




// import { SlackIntegration } from "./third-party-integration";
const prisma = new PrismaClient();
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

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
  clientId: process.env.SLACK_CLIENT_ID!,
  clientSecret: process.env.SLACK_CLIENT_SECRET!,
  stateSecret: process.env.SLACK_STATE_SECRET,
  scopes: ["commands", "chat:write"], // add your scopes here
  installationStore
});

const expressApp = receiver.app;

const app = new App({
  receiver,
  clientId: process.env.SLACK_CLIENT_ID,
  clientSecret: process.env.SLACK_CLIENT_SECRET,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  scopes: ["chat:write", "commands", "app_mentions:read"],
  installerOptions: {
    redirectUriPath: "/slack/oauth_redirect",
    installPath: "/slack/install",
    callbackOptions: {
      success: async (installation, options, callbackReq, callbackRes) => {
        await prisma.slackInstallation.update({ where: { installationId: installation.team?.id }, data: { workspaceId: options.metadata, connected: true } })
      }
    }
  },
  stateSecret: process.env.SLACK_STATE_SECRET,
  socketMode: false,
  installationStore,
  logLevel: LogLevel.DEBUG,
});
const PORT = process.env.PORT || 5000;


expressApp.use(cors())


app.command("/hello", async ({ ack, respond }) => {
  await ack();
  await respond("Hello message from slack app");
});




expressApp.listen(PORT, () => {
  console.log("slack app started successfully");
});











