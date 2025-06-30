type TMessage = {
    text: string;
    id: string;
    channelId: string;
    projectId: string;
    threadId: string;
    user: string;
    userId: string;
    mediaType: string;
    mediaLinks: string[];
    timestamp: Date;
    reference: string;
    deletedForMe: boolean;
    deletedForAll: boolean;
    attachement: string[];
}


export default TMessage