import { PrismaClient, Prisma } from "@prisma/client";
import { TTask } from "../types/task";
import { updateRedisMessage } from "./redisMessage";
import { Channel, ConsumeMessage } from "amqplib";
import Redis from "../redis/redis";

type TUpsertTaskParams = {
    prisma: PrismaClient | Prisma.TransactionClient,
    msgID: string,
    workspaceId: string,
    integration: string,
    status: boolean,
    channel: Channel
    message: ConsumeMessage,
    redis: Redis
}

async function upsertTask(taskParam: TUpsertTaskParams) {
    const { integration, msgID, prisma, status, workspaceId, channel, message: rabbitMsg, redis } = taskParam
    const existing = await prisma.task.findFirst({ where: { workspaceId, messageId: msgID, integration } });
    const message = await prisma.message.findUnique({ where: { id: msgID } })


    let task: TTask
    if (existing) {
        task = await prisma.task.update({ where: { messageId: msgID }, data: { status } });
    } else {
        task = await prisma.task.create({
            data: { messageId: msgID, integration, status, text: `schedule a ${integration} message`, workspaceId }
        });
    }
    if (message) {
        await prisma.message.update({ where: { id: msgID }, data: { attachement: { set: [task.id] } } })
    } else {
        updateRedisMessage(channel, rabbitMsg, redis, msgID, task)
    }

    return task

}

export default upsertTask