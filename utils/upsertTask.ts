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
    taskId: string,
    status: string,
    channel: Channel
    message: ConsumeMessage,
    redis: Redis
    q: string,
    payload: string
}



async function upsertTask(taskParam: TUpsertTaskParams) {
    const { integration, msgID, prisma, status, workspaceId, channel, message: rabbitMsg, redis, q, payload, taskId } = taskParam
    const current_task = await prisma.task.findUnique({ where: { workspaceId, messageId: msgID, integration, id: taskId } });
    const message = await prisma.message.findUnique({ where: { id: msgID } })


    let task: TTask
    if (current_task) {
        task = await prisma.task.update({ where: { id: taskId }, data: { status, messageId: msgID, integration, text: `create an integration`, workspaceId, queue: q, payload } });
        if (message) {
            await prisma.message.update({ where: { id: msgID }, data: { attachement: { set: [task.id] } } })
        } else {
            updateRedisMessage(channel, rabbitMsg, redis, msgID, task)
        }

        return task
    }


}

export default upsertTask