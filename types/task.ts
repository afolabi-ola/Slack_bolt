import { Prisma } from "@prisma/client";

type TTask = {
    integration: string;
    status: string;
    workspaceId: string;
    payload: Prisma.JsonValue | null;
    id: string;
    messageId: string | null;
    text: string | null;
    queue: string | null;
}
export type { TTask }