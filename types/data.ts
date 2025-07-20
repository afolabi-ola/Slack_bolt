type TMessageData = {
    text: string;
    channel: string;
    workspaceId: string;
    messageId: string;
    message?: TMessage;
}

type TMessage = {
    channelId: string;
    projectId: string;
    threadId: string;
    user: string;
    userId: string;
};

type TScheduleMessageData = {
    message?: TMessage;
    workspaceId: string;
    messageId: string;
    text: string;
    channel: string;
    post_at: string;
} | undefined
export type { TMessageData, TScheduleMessageData }