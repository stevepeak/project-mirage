import {
  ChatModel,
  EmbeddingModel,
  createOpenAIClient,
} from "@dexaai/dexter/model";
import { v4 as uuid } from "uuid";
import { QdrantClient } from "@qdrant/js-client-rest";
import {promises as fs} from "fs";

const qdrant = new QdrantClient({
  host: "<TODO>",
  apiKey: "<TODO>",
});

const openAI = createOpenAIClient({
  apiKey: "<TODO>",
});

const chatModel = new ChatModel({
  client: openAI,
});

const delim = "\n=====\n";

async function generateData(content: string) {
  const { message } = await chatModel.run({
    model: "gpt-3.5-turbo",
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: `
Your job is to generate random information that will be used as synthetic data.
Write 10 chunks of data that are 1000 characters or less each.
Each chunk should be separated by '${delim}'.
The information can be fact or fiction. Some irony or comedy would be great.`.trim(),
      },
      {
        role: "user",
        content,
      },
    ],
  });
  return message.content || "";
}

const embeddingModel = new EmbeddingModel({
  client: openAI,
  params: {
    model: "text-embedding-3-small",
    batch: {
      maxBatchSize: 30,
      maxTokensPerBatch: 10000,
    },
    throttle: {
      maxConcurrentRequests: 2,
      maxRequestsPerMin: 3000,
    },
  },
});

async function cli() {
  const prompt = process.argv[2];

  const data = await generateData(prompt);

  const chunks = data.split(delim);

  const { embeddings } = await embeddingModel.run({ input: chunks });

  const points = chunks.map((chunk, i) => ({
    id: uuid(),
    vector: embeddings[i],
    payload: {
      prompt,
      text: chunk,
    },
  }));

  await qdrant.upsert("mirage", { points });

  for (const point of points) {
    await fs.appendFile("points.jsonl", JSON.stringify(point));
  }

  console.log(points.length);
}

cli()
  .then(() => {
    console.info("Done");
    process.exit(0);
  })
  .catch((e) => {
    console.error("CLI error", e);
    process.exit(1);
  });
