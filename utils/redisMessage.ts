import Redis from "../redis/redis";
import TMessage from "../types/slackMessage.types";
import { TTask } from "../types/task";
import { Channel, ConsumeMessage } from "amqplib";
const redisMessage = async (channel: Channel, message: ConsumeMessage, redis: Redis, msgID: string) => {
    if (redis && redis.client) {
        const messages = await redis.client.LRANGE('chat_messages', 0, 50);
        if (!messages.length || messages.length < 1) {
            channel.nack(message, false, false)
            throw new Error("No message found in redis")
        }


        let cache_msg = messages.filter((cache_msg: string, idx: number) => {
            if (JSON.parse(cache_msg).id === msgID) {
                return cache_msg
            }
        })
        if (!cache_msg.length) {
            return undefined
        }
        let parsed_msg = JSON.parse(cache_msg[0])
        return parsed_msg as TMessage
    }
}


const updateRedisMessage = async (channel: Channel, message: ConsumeMessage, redis: Redis, msgID: string, task: TTask) => {
    if (redis && redis.client) {
        const messages = await redis.client.LRANGE('chat_messages', 0, 50);
        if (!messages.length || messages.length < 1) {
            channel.nack(message, false, false)
            throw new Error("Bad request")

        }

        let msg_index = 0
        let cache_msg = messages.filter((cache_msg: string, idx: number) => {
            if (JSON.parse(cache_msg).id === msgID) {
                msg_index = idx
                return cache_msg
            }
        })
        let parsed_msg = JSON.parse(cache_msg[0])
        parsed_msg = { ...parsed_msg, attachement: [task.id] }

        await redis.client.LSET("chat_messages", msg_index, JSON.stringify(parsed_msg))
    }
}


export { redisMessage, updateRedisMessage }