import { Client } from '@elastic/elasticsearch';
import { config } from '../../config';
import { logger } from '../../utils/logger';

let esClient: Client | null = null;

const EMAIL_INDEX = 'emails';

export function getElasticsearchClient(): Client {
  if (!esClient) {
    esClient = new Client({
      node: config.elasticsearch.url,
      requestTimeout: 10000,
      maxRetries: 3,
    });
  }
  return esClient;
}

export async function initElasticsearchIndex(): Promise<void> {
  const client = getElasticsearchClient();

  try {
    const exists = await client.indices.exists({ index: EMAIL_INDEX });

    if (!exists) {
      await client.indices.create({
        index: EMAIL_INDEX,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                email_analyzer: {
                  type: 'custom',
                  tokenizer: 'uax_url_email',
                  filter: ['lowercase'],
                },
              },
            },
          },
          mappings: {
            properties: {
              emailId: { type: 'keyword' },
              userId: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              recipient: { type: 'text', analyzer: 'email_analyzer', fields: { keyword: { type: 'keyword' } } },
              senderEmail: { type: 'text', analyzer: 'email_analyzer', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              body: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
            },
          },
        },
      });
      logger.info('Elasticsearch index created: emails');
    } else {
      logger.info('Elasticsearch index already exists: emails');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to initialize Elasticsearch index');
    // Non-fatal: scheduling should work without Elasticsearch
  }
}

export interface EmailDocument {
  emailId: string;
  userId: string;
  campaignId: string;
  senderId: string;
  recipient: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string;
}

export async function indexEmail(doc: EmailDocument): Promise<void> {
  try {
    const client = getElasticsearchClient();
    await client.index({
      index: EMAIL_INDEX,
      id: doc.emailId,
      document: doc,
    });
  } catch (err) {
    logger.error({ err, emailId: doc.emailId }, 'Failed to index email in Elasticsearch');
    // Non-fatal
  }
}

export async function updateEmailIndex(emailId: string, updates: Partial<EmailDocument>): Promise<void> {
  try {
    const client = getElasticsearchClient();
    await client.update({
      index: EMAIL_INDEX,
      id: emailId,
      doc: updates,
    });
  } catch (err) {
    logger.error({ err, emailId }, 'Failed to update email in Elasticsearch');
  }
}

export async function searchEmails(
  userId: string,
  query: string,
  page: number = 1,
  limit: number = 25,
): Promise<{ results: EmailDocument[]; total: number }> {
  try {
    const client = getElasticsearchClient();
    const from = (page - 1) * limit;

    const result = await client.search<EmailDocument>({
      index: EMAIL_INDEX,
      body: {
        from,
        size: limit,
        query: {
          bool: {
            must: [
              { term: { userId } },
              {
                multi_match: {
                  query,
                  fields: ['recipient', 'subject', 'body', 'senderEmail'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                },
              },
            ],
          },
        },
        sort: [{ scheduledAt: { order: 'desc' } }],
      },
    });

    const hits = result.hits.hits;
    const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0;

    return {
      results: hits.map((hit) => hit._source as EmailDocument),
      total,
    };
  } catch (err) {
    logger.error({ err, userId, query }, 'Elasticsearch search failed');
    return { results: [], total: 0 };
  }
}

export async function closeElasticsearch(): Promise<void> {
  if (esClient) {
    await esClient.close();
    esClient = null;
    logger.info('Elasticsearch connection closed');
  }
}
