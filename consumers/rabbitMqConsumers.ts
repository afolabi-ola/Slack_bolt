import { ConsumeMessage } from "amqplib"
import { validateSlackMsgPayload, validateSlackSchedule } from "../zod/slack-schedule.schema"
import validateOrCreateMessage from "../utils/validateMessageId"
import { Prisma, PrismaClient } from "@prisma/client"
import Redis from "../redis/redis"
import upsertTask from "../utils/upsertTask"
import { App, StringIndexed } from "@slack/bolt"
import amqp from "amqplib"
import { EventEmitter } from "node:stream"



const prisma = new PrismaClient()
type TPrismaTransaction = Prisma.TransactionClient

enum TTaskStatus {
    QUEUED = "queued",
    SUCCESS = "success",
    FAILED = "failed"
}

const rabbitMQConsumer = (channel: amqp.Channel, redis: Redis, app: App<StringIndexed>, emitter: EventEmitter) => {

    channel.consume("slack-schedule", async (message: ConsumeMessage | null) => {

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
                status: TTaskStatus.FAILED// default to fail, we'll update to true if successful
            };

            const integration = await prisma.integration.findUnique({ where: { id: data.integrationId } })
            try {
                await app.client.chat.scheduleMessage({ text: data.text, post_at: data.post_at, channel: data.channel, token: integration?.slackBotoken as string })
                taskData.status = TTaskStatus.SUCCESS
            } catch (e) {
                taskData.status = TTaskStatus.FAILED
                channel.ack(message)
            }

            // for a task to fail , then a message already exist
            const { message: exist_msg, ...other } = data

            await upsertTask({
                channel,
                integration: taskData.integration,
                message,
                msgID: taskData.messageId,
                prisma,
                redis,
                taskId: data.taskId,
                status: taskData.status,
                workspaceId: taskData.workspaceId,
                q: "slack-schedule",
                payload: JSON.stringify({ ...other, messageId: msgID })
            })




        } catch (e) {
            process.env.NODE_ENV?.includes("dev") && console.log("an error occured", e)
            channel.nack(message as amqp.Message, false, false)
        }
    })

    channel.consume("slack_installation", async (message: ConsumeMessage | null) => {
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
            let status: string = TTaskStatus.FAILED
            try {

                const integration = await prisma.integration.findUnique({ where: { id: data.integrationId } })
                if (integration && integration.slackBotoken && integration.slackBotoken.length) {
                    await app.client.chat.postMessage({
                        channel: msg.channel,
                        text: msg.text,
                        token: integration.slackBotoken
                    })

                    status = TTaskStatus.SUCCESS
                } else {
                    console.log("no integration token")
                    channel.nack(message, false, false)
                    return

                }

            } catch (e) {
                status = TTaskStatus.FAILED
                channel.nack(message, false, false)
            }

            // for a task to fail , then a message already exist

            const { message: exist_msg, ...other } = data
            await prisma.$transaction(async (tx: TPrismaTransaction) => {
                await upsertTask({
                    channel,
                    integration: "slack",
                    message,
                    msgID,
                    prisma: tx,
                    taskId: data.taskId,
                    redis,
                    status,
                    workspaceId: data.workspaceId,
                    q: "slack_message",
                    payload: JSON.stringify({ ...other, messageId: msgID })
                })


            })

            channel.ack(message)


        }
    })
}


export default rabbitMQConsumer