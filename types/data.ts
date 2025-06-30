type TMessageData = {
    text: string;
    channel: string;
    workspaceId: string;
    messageId: string;
    message?: {
        channelId: string;
        projectId: string;
        threadId: string;
        user: string;
        userId: string;
    } | undefined;
}

type TScheduleMessageData = {
    message: {
        channelId: string;
        projectId: string;
        threadId: string;
        user: string;
        userId: string;
    };
    workspaceId: string;
    messageId: string;
    text: string;
    channel: string;
    post_at: string;
} | undefined
export type { TMessageData, TScheduleMessageData }