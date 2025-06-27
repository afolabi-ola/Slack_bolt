import { PrismaClient, Prisma } from "@prisma/client";
import { TTask } from "../types/task";

async function upsertTask(prisma: PrismaClient | Prisma.TransactionClient, msgID: string, workspaceId: string, integration: string, status: boolean) {
    const existing = await prisma.task.findFirst({ where: { workspaceId, messageId: msgID, integration } });
    const message = await prisma.message.findUnique({ where: { id: msgID } })
    const isSlackIncluded = message?.attachement.includes("slack")
    let updated_attachement = message?.attachement as Array<string>
    if (isSlackIncluded) {
        updated_attachement = message?.attachement.filter((item) => item !== "slack") as Array<string>
    }
    if (message) {
        await prisma.message.update({ where: { id: msgID }, data: { attachement: [...updated_attachement, "slack"] } })
    } else {

    }
    let task: TTask
    if (existing) {
        task = await prisma.task.update({ where: { messageId: msgID }, data: { status } });

    } else {
        task = await prisma.task.create({
            data: { messageId: msgID, integration, status, text: `schedule a ${integration} message`, workspaceId }
        });
    }

    return task

}

export default upsertTask