import { z } from "zod";

const expenseParseResponseSchema = z.object({
  payer_id: z.string().uuid().optional(),
  total_amount_paise: z.number().int().positive().optional(),
  description: z.string().trim().min(1).optional(),
  split_type: z.enum(["equal", "itemized", "custom"]).optional(),
  participant_ids: z.array(z.string().uuid()).optional(),
  clarification_needed: z.string().trim().min(1).optional(),
}).strict();

export type ExpenseParseResult = z.infer<typeof expenseParseResponseSchema>;

type ParseExpenseTextInput = {
  text: string;
  payerId: string;
  payerLabel: string;
  subgroupName: string;
  members: Array<{ id: string; label: string }>;
};

export async function parseExpenseText({ text, payerId, payerLabel, subgroupName, members }: ParseExpenseTextInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to parse expenses.");
  }

  const configuredModel = process.env.OPENAI_EXPENSE_MODEL?.trim();
  // Keep the old placeholder from breaking environments that have not been updated yet.
  const model = configuredModel && configuredModel !== "gpt-5.6-luna"
    ? configuredModel
    : "gpt-4.1-mini";
  const toolName = "extract_expense";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      tool_choice: {
        type: "function",
        function: {
          name: toolName,
        },
      },
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: "Extract a group expense into a fixed schema. If amount or participants are unclear, return clarification_needed instead of guessing.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                payer_id: {
                  type: "string",
                  description: "The paying user ID. Default to the sender if not explicitly stated.",
                },
                total_amount_paise: {
                  type: "integer",
                  description: "The total amount in integer paise.",
                },
                description: {
                  type: "string",
                  description: "Short expense description.",
                },
                split_type: {
                  type: "string",
                  enum: ["equal", "itemized", "custom"],
                },
                participant_ids: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                  description: "The user IDs who should share the expense. Default to all current subgroup members if unstated.",
                },
                clarification_needed: {
                  type: "string",
                  description: "A short follow-up question when the amount or participants are genuinely ambiguous.",
                },
              },
            },
          },
        },
      ],
      messages: [
        {
          role: "system",
          content: [
            "You turn a single expense description into structured data.",
            "Use only the provided member IDs. Do not invent IDs.",
            "If the amount or participant list is genuinely ambiguous, set clarification_needed and keep the rest minimal.",
            "If the text does not specify participants clearly, default participant_ids to every current subgroup member.",
            "Treat payer_id as the sender unless the text clearly says otherwise.",
            "The payer is always part of the split preview.",
            "Treat ordinary currency amounts as rupees unless the text explicitly says paise, and return integer paise.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            expense_text: text,
            payer: {
              id: payerId,
              label: payerLabel,
            },
            subgroup: subgroupName,
            members,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null) as {
      error?: { message?: string };
    } | null;
    const providerMessage = errorPayload?.error?.message;
    throw new Error(
      providerMessage
        ? `OpenAI parser request failed: ${providerMessage}`
        : `OpenAI parser request failed with status ${response.status}.`,
    );
  }

  const payload: unknown = await response.json();
  const toolCall = z.object({
    choices: z.array(
      z.object({
        message: z.object({
          tool_calls: z.array(
            z.object({
              function: z.object({
                arguments: z.string(),
              }),
            }),
          ).optional(),
        }),
      }),
    ),
  }).safeParse(payload);

  if (!toolCall.success) {
    throw new Error("The expense parser returned an unexpected response shape.");
  }

  const argumentsText = toolCall.data.choices[0]?.message.tool_calls?.[0]?.function.arguments;
  if (!argumentsText) {
    throw new Error("The expense parser did not return structured arguments.");
  }

  const parsedArguments = JSON.parse(argumentsText) as unknown;
  return expenseParseResponseSchema.parse(parsedArguments);
}
