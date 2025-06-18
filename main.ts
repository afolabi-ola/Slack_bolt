// import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { config } from "dotenv";
// import crypto from "node:crypto";
// import { PrismaClient } from "@prisma/client";
import express from "express";
import cors from "cors"
const app = express()
config();

import { SlackIntegration } from "./third-party-integration";

// const prisma = new PrismaClient();
// const installationStore = {
//   // takes in an installation object as an argument
//   // returns nothing
//   storeInstallation: async (installation: any) => {
//     // replace myDB.set with your own database or OEM setter
//     console.log(installation.metadata)
//     if (installation.isEnterpriseInstall) {
//       // support for org wide app installation

//       await prisma.slackInstallation.create({
//         data: {
//           installationId: installation.enterprise?.id as string,
//           installation: JSON.stringify(installation),

//         },
//       });
//     } else {
//       // single team app installation
//       // return myDB.set(installation.team.id, installation);
//       await prisma.slackInstallation.create({
//         data: {
//           installationId: installation.team?.id as string,
//           installation: JSON.stringify(installation),

//         },
//       });
//     }
//   },

//   fetchInstallation: async (installQuery: any) => {
//     // replace myDB.get with your own database or OEM getter
//     if (
//       installQuery.isEnterpriseInstall &&
//       installQuery.enterpriseId !== undefined
//     ) {
//       // org wide app installation lookup
//       // return await myDB.get(installQuery.enterpriseId);
//       const slackInstallation = await prisma.slackInstallation.findUnique({
//         where: {
//           id: installQuery.enterpriseId,
//         },
//       });

//       if (slackInstallation) {
//         const installation = JSON.parse(slackInstallation.installation);
//         return installation;
//       }
//     }
//     if (installQuery.teamId !== undefined) {
//       // single team app installation lookup

//       const slackInstallation = await prisma.slackInstallation.findUnique({
//         where: { id: installQuery.teamId },
//       });

//       if (slackInstallation) {
//         const installation = JSON.parse(slackInstallation.installation);
//         return installation;
//       }
//     }
//     throw new Error("Failed fetching installation");
//   },

//   deleteInstallation: async (installQuery: any) => {
//     // replace myDB.get with your own database or OEM getter
//     if (
//       installQuery.isEnterpriseInstall &&
//       installQuery.enterpriseId !== undefined
//     ) {
//       // org wide app installation deletion
//       // return await myDB.delete(installQuery.enterpriseId);
//       await prisma.slackInstallation.delete({
//         where: { id: installQuery.enterpriseId },
//       });
//     }
//     if (installQuery.teamId !== undefined) {
//       // single team app installation deletion
//       await prisma.slackInstallation.delete({
//         where: { id: installQuery.teamId },
//       });
//     }
//   },
// };

// const receiver = new ExpressReceiver({
//   signingSecret: process.env.SLACK_SIGNING_SECRET!,
//   clientId: process.env.SLACK_CLIENT_ID!,
//   clientSecret: process.env.SLACK_CLIENT_SECRET!,
//   stateSecret: process.env.SLACK_STATE_SECRET,
//   scopes: ["commands", "chat:write"], // add your scopes here
//   installationStore
// });

// const expressApp = receiver.app;

// receiver.app.get("s/akc")



// const app = new App({
//   receiver,
//   clientId: process.env.SLACK_CLIENT_ID,
//   clientSecret: process.env.SLACK_CLIENT_SECRET,
//   signingSecret: process.env.SLACK_SIGNING_SECRET,
//   scopes: ["chat:write", "commands", "app_mentions:read"],
//   installerOptions: {
//     redirectUriPath: "/slack/oauth_redirect",
//     installPath: "/slack/install",
//     callbackOptions: {
//       success: async (installation, options, callbackReq, callbackRes) => {

//         await prisma.slackInstallation.update({ where: { installationId: installation.team?.id }, data: { workspaceId: options.metadata, connected: true } })
//       }
//     }
//   },
//   stateSecret: process.env.SLACK_STATE_SECRET,
//   socketMode: false,
//   installationStore,
//   logLevel: LogLevel.DEBUG,
// });
const PORT = process.env.PORT || 3030;
// app.command("/hello", async ({ ack, respond }) => {
//   await ack("Hello message from slack app");
//   //   await respond();
// });

// // expressApp.use("/slack", receiver.app);

// expressApp.listen(3030, () => {
//   console.log("slack app started successfully");
// });



// // (async () => {
// //   await app.start(PORT);

// // })();


const slack = new SlackIntegration()
  .connect()
const installer = slack.installation

app.use(cors())
app.get('/slack/install', async (req, res) => {
  const { workspaceId } = req.query
  if (!workspaceId) {
    res.send("invalid workspace id")
  }
  const url = await installer?.
    generateInstallUrl({ scopes: ["commands", "chat:write"], metadata: workspaceId as string })
  const state = url?.split('state=')[1]?.split('&')[0];
  console.log('[Install] Generated state:', state);
  if (url) res.redirect(url)
})

app.get("/slack/oauth_redirect", async (req, res) => {
  console.log(req.query.state)
  console.log('[Callback] Headers:', req.headers);
  try {
    await installer?.handleCallback(req, res);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Authentication failed');
  }
})

app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`)
})