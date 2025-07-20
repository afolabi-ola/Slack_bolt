import { App, ExpressReceiver, LogLevel } from "@slack/bolt";
import { config } from "dotenv";
import { EventEmitter } from 'node:events'
import { Prisma, PrismaClient } from "@prisma/client";
import amqp, { ConsumeMessage } from "amqplib"
import Redis from "./redis/redis";
import rabbitMQConsumer from "./consumers/rabbitMqConsumers";
import getInstallationStore from "./utils/installationStore";

config();

class CustomEmitter extends EventEmitter {
  constructor() {
    super()
  }
}


const emitter = new CustomEmitter()
const prisma = new PrismaClient();

const main = async () => {
  let channel: amqp.Channel


  const installationStore = getInstallationStore(prisma)

  const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    clientId: process.env.SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
    stateSecret: process.env.SLACK_STATE_SECRET,
    scopes: ["commands", "chat:write"], // add your scopes here
    installationStore
  });

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

  try {
    const connection = await amqp.connect("amqp://localhost")

    const redis = new Redis()
    redis.connect().then(() => {
      console.log("🔗connected to redis successfully")
    }).catch(e => {
      console.log(" ❌ an error occured while connecting to redis")
    })

    channel = await connection.createChannel()
    channel.prefetch(1)


    channel.assertQueue("slack_message", { durable: true })

    channel.assertQueue("slack_installation", {
      durable: true
    })

    channel.assertQueue("slack-schedule", {
      durable: true
    })


    rabbitMQConsumer(channel, redis, app, emitter)


  } catch (e) {
    console.log("an error occured while  connecting to rabbitmq", e)
  }


  const expressApp = receiver.app;


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













