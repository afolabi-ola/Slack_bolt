import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { config } from "dotenv";
import { EventEmitter } from 'node:events'
import { Prisma, PrismaClient } from "@prisma/client";
import amqp, { ConsumeMessage } from "amqplib"
import Redis from "./redis/redis";
import { validateSlackMsgPayload, validateSlackSchedule } from "./zod/slack-schedule.schema";
import upsertTask from "./utils/upsertTask";
import validateOrCreateMessage from "./utils/validateMessageId";

config();

class CustomEmitter extends EventEmitter {
  constructor() {
    super()
  }
}

type TPrismaTransaction = Prisma.TransactionClient

const emitter = new CustomEmitter()

const main = async () => {
  let channel: amqp.Channel
  let queue_name: string
  try {
    const connection = await amqp.connect("amqp://localhost")

    const redis = new Redis()
    redis.connect().then(() => {
      console.log("🔗connected to redis successfully")
    }).catch(e => {
      console.log(" ❌ an error occured while connecting to redis")
    })

    const REDIS_MIN = 0
    const REDIS_MAX = 50

    channel = await connection.createChannel()
    channel.prefetch(1)

    queue_name = "slack_installation"

    channel.assertQueue("slack_message", { durable: true })

    channel.consume("slack_message", async (message: ConsumeMessage | null) => {

      if (message) {

        const msg = JSON.parse(message?.content.toString() as string)

        const { error, data } = validateSlackMsgPayload(msg)
        if (error) {
          console.log(`Validation Error: ${error.errors[0].message}`)
          channel.nack(message, false, false)
          return
        }


        const msgID = await validateOrCreateMessage(channel, message, prisma, redis, data)
        if (!msgID) {
          return
        }
        let status: boolean = false
        try {

          const integration = await prisma.integration.findFirst({ where: { workspaceId: data.workspaceId, service: "slack" } })
          if (!integration) {
            process.env.NODE_ENV?.includes("dev") && console.log("integration not found")

            channel.nack(message, false, false)
            throw new Error("Integration not found")
          }
          else {
            if (integration.slackBotoken && integration.slackBotoken.length) {
              await app.client.chat.postMessage({
                channel: msg.channel,
                text: msg.text,
                token: integration.slackBotoken
              })

              status = true
            }
          }
        } catch (e) {
          status = false
          channel.nack(message, false, false)
        }


        await prisma.$transaction(async (tx: TPrismaTransaction) => {
          await upsertTask({
            channel,
            integration: "slack",
            message,
            msgID,
            prisma: tx,
            redis,
            status,
            workspaceId: data.workspaceId
          })


        })

        channel.ack(message)


      }
    })

    channel.assertQueue(queue_name, {
      durable: true
    })

    channel.consume(queue_name, async (message: ConsumeMessage | null) => {
      if (message) {
        const workspaceId = message.content.toString()
        try {
          await prisma.$transaction(async (tx: TPrismaTransaction) => {
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

    const slack_schedule_q = "slack-schedule"

    channel.assertQueue(slack_schedule_q, {
      durable: true
    })

    channel.consume(slack_schedule_q, async (message: ConsumeMessage | null) => {

      if (!message) return
      try {


        const content = JSON.parse(message.content.toString())
        const { error, data } = validateSlackSchedule(content)
        if (error) {
          channel.nack(message, false, false)
          console.log("❌ Bad message")
          return
        }

        const msgID = await validateOrCreateMessage(channel, message, prisma, redis, data)
        if (!msgID) {
          channel.nack(message, false, false)
          throw new Error("messageId not found in both db")
        }


        const taskData = {
          messageId: msgID,
          integration: "slack",
          text: "schedule a slack message",
          workspaceId: data.workspaceId,
          status: false // default to fail, we'll update to true if successful
        };


        const integration = await prisma.integration.findFirst({ where: { workspaceId: data.workspaceId as string, service: "slack" } })


        if (!integration) {
          console.log("integration not found")
          channel.nack(message, false, false)
          throw new Error("Integration not found")
        } else {
          try {
            await app.client.chat.scheduleMessage({ text: data.text, post_at: data.post_at, channel: data.channel, token: integration?.slackBotoken as string })
            taskData.status = true
          } catch (e) {
            channel.ack(message)
          }
        }
        await upsertTask({
          channel,
          integration: taskData.integration,
          message,
          msgID: taskData.messageId,
          prisma,
          redis,
          status: taskData.status,
          workspaceId: taskData.workspaceId
        })




      } catch (e) {
        process.env.NODE_ENV?.includes("dev") && console.log("an error occured", e)
        channel.nack(message as amqp.Message, false, false)
      }
    })

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


  expressApp.get("/", (req, res) => {
    res.send("Welcome to slack server for artificium")
  })

  expressApp.get("/slack/channels/:workspaceId", async (req, res) => {
    const workspaceId = req.params["workspaceId"]
    if (workspaceId.length !== 24) {
      res.status(400).send({ message: "invalid workspace id" })
      return
    }

    const integration = await prisma.integration.findFirst({ where: { service: "slack", workspaceId } })
    if (!integration) {
      res.status(404).send({ message: "slack has not been setup in your workspace, report to admin" })
      return
    }

    const result = await app.client.conversations.list({ token: integration.slackBotoken as string, types: "public_channel", exclude_archived: true, limit: 100 })
    res.send({ message: "channels retrieved successfully", data: result.channels })
  })


  expressApp.listen(PORT, async () => {
    console.log("slack app started successfully");
  });

}

main()













