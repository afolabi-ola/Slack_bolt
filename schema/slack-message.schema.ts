import z from "zod"


const slackSchema = z.object({
    workspaceId: z.string({ message: "property workspaceId is required" })
})

type TSlackPayload = Required<z.infer<typeof slackSchema>>
const validateSlackSchema = (payload: TSlackPayload) => {
    return slackSchema.required().safeParse(payload)

}


export { slackSchema, validateSlackSchema }