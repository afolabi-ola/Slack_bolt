import { ObjectId } from "mongodb"
import { TSlackScheduleMessage } from "../zod/slack-schedule.schema"
import { PrismaClient } from "@prisma/client"
import { Channel, ConsumeMessage } from "amqplib"
import Redis from "../redis/redis"
import { TTask } from "../types/task"
import { redisMessage } from "./redisMessage"
import { TMessageData } from "../types/data"

const validateOrCreateMessage = async (channel: Channel, message: ConsumeMessage, prisma: PrismaClient, redis: Redis, data?: TMessageData | TSlackScheduleMessage) => {
    if (!data) {
        return null
    }
    let msgID = data.messageId && ObjectId.isValid(data.messageId) ? data.messageId : null

    if (!msgID && data.message) {
        const { channelId, projectId, threadId, user, userId } = data.message
        const msg = await prisma.message.create({ data: { channelId, projectId, threadId, text: "", user, userId } })
        msgID = msg.id
    }
    else if (msgID && !data.message) {
        const user_message = await prisma.message.findUnique({ where: { id: msgID } })
        if (!user_message) {
            const redisMsg = await redisMessage(channel, message, redis, msgID)
            if (redisMsg) {
                return redisMsg.id
            }
            console.log("message not found")
            channel.nack(message, false, false)
            return null
        }
    }
    else {
        console.log("Bad Payload")
        channel.nack(message, false, false)
        return null
    }
    return msgID
}

export default validateOrCreateMessage