import { App, AwsLambdaReceiver, ExpressReceiver, LogLevel } from "@slack/bolt";
import { config } from "dotenv";
import { EventEmitter } from 'node:events'
import { PrismaClient } from "@prisma/client";
import amqp from "amqplib"

config();

class CustomEmitter extends EventEmitter {
  constructor() {
    super()
  }
}


const emitter = new CustomEmitter()
const main = async () => {
  let channel: amqp.Channel
  let queue_name: string
  try {
    const connection = await amqp.connect("amqp://localhost")

    channel = await connection.createChannel()
    queue_name = "slack_installation"
    channel.assertQueue(queue_name, {
      durable: true
    })


    channel.prefetch(1)

    channel.consume(queue_name, async (message) => {
      if (message) {
        const workspaceId = message.content.toString()
        try {
          await prisma.$transaction(async (tx) => {
            await tx.integration.create({
              data: {
                service: "slack",
                status: true,
                workspaceId: workspaceId,

              }
            })


            await tx.workspace.update({ where: { id: workspaceId }, data: { integrations: { push: "slack" } } })


          })
        }
        catch (e) {
          channel.nack(message, false, false)
        }

        emitter.on("slack_install_success", () => {
          channel.ack(message)
        })
      }
    }, { noAck: false })




  } catch (e) {
    console.log("an error occured while  connecting to rabbitmq", e)
  }

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

        afterInstallation: async (installation, options, callbackReq, callbackRes) => {


          return true
        },

        success: async (installation, options, callbackReq, callbackRes) => {
          emitter.emit("slack_install_success")
        }
      }
    },
    stateSecret: process.env.SLACK_STATE_SECRET,
    socketMode: false,
    installationStore,
    logLevel: LogLevel.DEBUG,
  });
  const PORT = process.env.PORT || 5000;




  app.command("/hello", async ({ ack, respond }) => {
    await ack();
    await respond("Hello message from slack app");
  });

  expressApp.use((req, res, next) => {
    console.log("Hello Guys")
    next()

  })


  expressApp.get("/", (req, res) => {
    res.send("Hi Here")
  })


  expressApp.listen(PORT, async () => {
    console.log("slack app started successfully");
  });

}

main()













