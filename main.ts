import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { config } from "dotenv";
import { EventEmitter } from 'node:events'
import { Prisma, PrismaClient } from "@prisma/client";
import amqp, { ConsumeMessage } from "amqplib"
import Redis from "./redis/redis";
import { ObjectId } from "mongodb";

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

        try {
          await app.client.chat.postMessage({
            channel: msg.channel,
            text: msg.text,
            token: msg.token
          })


          let task = await prisma.task.findUnique({ where: { messageId: msg.messageId } })
          await prisma.$transaction(async (tx: TPrismaTransaction) => {
            if (task) {
              await tx.task.update({ where: { messageId: msg.messageId, id: task.id }, data: { status: true } })
            }
            else {
              task = await tx.task.create({ data: { messageId: msg.messageId, workspaceId: msg.workspaceId, status: true, integration: "slack", text: msg.text } })
            }

            const found_msg = await tx.message.findUnique({ where: { id: msg.messageId } })
            if (found_msg) {
              await tx.message.update({ where: { id: found_msg.id }, data: { attachement: [task.id] } })
              return
            }
            if (redis && redis.client) {
              const messages = await redis.client.LRANGE('chat_messages', 0, 50);
              if (!messages.length || messages.length < 1) {
                throw new Error("Bad request")
              }

              let msg_index = 0
              let cache_msg = messages.filter((cache_msg, idx) => {
                if (JSON.parse(cache_msg).id === msg.messageId) {
                  msg_index = idx
                  return cache_msg
                }
              })
              let parsed_msg = JSON.parse(cache_msg[0])
              parsed_msg = { ...parsed_msg, attachement: [task.id] }
              await redis.client.LSET("chat_messages", msg_index, JSON.stringify(parsed_msg))
            }

          })

          channel.ack(message)

        } catch (e) {
          let task = await prisma.task.findUnique({ where: { messageId: msg.messageId } })
          if (task) {
            await prisma.task.update({ where: { messageId: msg.messageId }, data: { status: false } })
            return
          }
          await prisma.task.create({ data: { messageId: msg.messageId, workspaceId: msg.workspaceId, status: false, integration: "slack", text: msg.text } })
          channel.nack(message, false, false)
        }
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


  expressApp.post("/slack/schedule/", async (req, res) => {
    const { workspaceId, text, post_at, channel, messageId } = req.query

    if (!workspaceId || !text || !post_at || channel) {
      res.status(400).send({ message: "invalid query " })
      return
    }
    if (!ObjectId.isValid(workspaceId as string)) {
      res.status(400).send({ message: "Invalid workspaceId" })
      return
    }

    // TODO: complete slack scheduling feature , refactor and make code reusable
    const integration = await prisma.integration.findFirst({ where: { workspaceId: workspaceId as string, service: "slack" } })
    try {
      await app.client.chat.scheduleMessage({ text: text as string, post_at: Math.floor(Number(post_at)), channel: channel as string, token: integration?.slackBotoken as string })
      // await prisma
      res.send({ message: "slack message scheduled successfully" })
    } catch (e) {

    }
  })

  expressApp.listen(PORT, async () => {
    console.log("slack app started successfully");
  });

}

main()













