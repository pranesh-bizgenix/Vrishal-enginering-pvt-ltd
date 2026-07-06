import { Injectable } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';

type DeliveryResult = {
  status: 'SENT' | 'FAILED';
  detail?: string;
};

type TemplateSendInput = {
  name: string;
  parameters: string[];
  languageCode?: string;
};

type DocumentTemplateSendInput = {
  name: string;
  languageCode?: string;
  bodyParameters?: string[];
  document: {
    filename: string;
    buffer: Buffer;
    mimeType?: string;
  };
};

@Injectable()
export class WhatsappService {
  private postJson(
    urlValue: string,
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ) {
    return new Promise<{ ok: boolean; statusCode: number; body: string }>(
      (resolve, reject) => {
        const url = new URL(urlValue);
        const body = JSON.stringify(payload);
        const client = url.protocol === 'https:' ? https : http;
        const request = client.request(
          {
            method: 'POST',
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body).toString(),
              ...headers,
            },
          },
          (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              responseBody += chunk;
            });
            response.on('end', () => {
              resolve({
                ok:
                  (response.statusCode || 500) >= 200 &&
                  (response.statusCode || 500) < 300,
                statusCode: response.statusCode || 500,
                body: responseBody,
              });
            });
          },
        );

        request.on('error', reject);
        request.write(body);
        request.end();
      },
    );
  }

  private postMultipart(
    urlValue: string,
    fields: Record<string, string>,
    file: {
      fieldName: string;
      filename: string;
      mimeType: string;
      buffer: Buffer;
    },
    headers: Record<string, string>,
  ) {
    return new Promise<{ ok: boolean; statusCode: number; body: string }>(
      (resolve, reject) => {
        const url = new URL(urlValue);
        const boundary = `----ems-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const chunks: Buffer[] = [];

        for (const [name, value] of Object.entries(fields)) {
          chunks.push(Buffer.from(`--${boundary}\r\n`));
          chunks.push(
            Buffer.from(
              `Content-Disposition: form-data; name="${name}"\r\n\r\n`,
            ),
          );
          chunks.push(Buffer.from(`${value}\r\n`));
        }

        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(
          Buffer.from(
            `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`,
          ),
        );
        chunks.push(Buffer.from(`Content-Type: ${file.mimeType}\r\n\r\n`));
        chunks.push(file.buffer);
        chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const body = Buffer.concat(chunks);
        const client = url.protocol === 'https:' ? https : http;
        const request = client.request(
          {
            method: 'POST',
            hostname: url.hostname,
            port: url.port,
            path: `${url.pathname}${url.search}`,
            headers: {
              'Content-Type': `multipart/form-data; boundary=${boundary}`,
              'Content-Length': body.length.toString(),
              ...headers,
            },
          },
          (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              responseBody += chunk;
            });
            response.on('end', () => {
              resolve({
                ok:
                  (response.statusCode || 500) >= 200 &&
                  (response.statusCode || 500) < 300,
                statusCode: response.statusCode || 500,
                body: responseBody,
              });
            });
          },
        );

        request.on('error', reject);
        request.write(body);
        request.end();
      },
    );
  }

  private getMediaUploadUrl(phoneNumberId: string) {
    if (process.env.WHATSAPP_MEDIA_UPLOAD_URL?.trim()) {
      return process.env.WHATSAPP_MEDIA_UPLOAD_URL.trim();
    }

    return `${this.getGraphApiBaseUrl()}/${phoneNumberId}/media`;
  }

  private getGraphApiBaseUrl() {
    const version = process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v19.0';
    return `https://graph.facebook.com/${version}`;
  }

  private getGraphMessagesUrl(phoneNumberId: string) {
    if (process.env.WHATSAPP_GRAPH_MESSAGES_URL?.trim()) {
      return process.env.WHATSAPP_GRAPH_MESSAGES_URL.trim();
    }

    return `${this.getGraphApiBaseUrl()}/${phoneNumberId}/messages`;
  }

  private getGraphHeaders() {
    const token = process.env.WHATSAPP_GRAPH_API_TOKEN?.trim();
    if (!token) {
      return { error: 'WHATSAPP_GRAPH_API_TOKEN is not configured.' };
    }

    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }

  private async uploadDocumentMedia(
    phoneNumberId: string,
    headers: Record<string, string>,
    document: DocumentTemplateSendInput['document'],
  ) {
    const uploadUrl = this.getMediaUploadUrl(phoneNumberId);
    const response = await this.postMultipart(
      uploadUrl,
      {
        messaging_product: 'whatsapp',
        type: document.mimeType || 'application/pdf',
      },
      {
        fieldName: 'file',
        filename: document.filename,
        mimeType: document.mimeType || 'application/pdf',
        buffer: document.buffer,
      },
      headers,
    );

    if (!response.ok) {
      const detail = response.body?.trim();
      throw new Error(
        detail
          ? `Media upload failed: ${response.statusCode} ${detail}`
          : `Media upload failed: ${response.statusCode}`,
      );
    }

    const parsed = JSON.parse(response.body || '{}') as { id?: string };
    if (!parsed.id) {
      throw new Error('Media upload did not return an id from Meta.');
    }

    return parsed.id;
  }

  private getRequestConfig() {
    const apiUrl = process.env.WHATSAPP_API_URL?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!phoneNumberId) {
      return { error: 'WHATSAPP_PHONE_NUMBER_ID is not configured.' };
    }

    const headers: Record<string, string> = {};
    if (process.env.WHATSAPP_GRAPH_API_TOKEN?.trim()) {
      headers.Authorization = `Bearer ${process.env.WHATSAPP_GRAPH_API_TOKEN.trim()}`;
    }

    return { apiUrl, phoneNumberId, headers };
  }

  private getProviderFailureDetail(response: {
    ok: boolean;
    statusCode: number;
    body: string;
  }) {
    const responseDetail = response.body?.trim();

    if (!response.ok) {
      return responseDetail
        ? `${response.statusCode} ${responseDetail}`
        : `${response.statusCode}`;
    }

    if (!responseDetail) {
      return '';
    }

    try {
      const parsed = JSON.parse(responseDetail) as Record<string, unknown>;
      const success = parsed.success;
      const status =
        typeof parsed.status === 'string' ? parsed.status.toLowerCase() : '';
      const error =
        parsed.error || parsed.errors || parsed.detail || parsed.message;

      if (
        success === false ||
        ['failed', 'failure', 'error', 'ignored'].includes(status)
      ) {
        return typeof error === 'string' ? error : responseDetail;
      }
    } catch {
      return '';
    }

    return '';
  }
  private async sendPayloadToRecipients(
    recipients: string[],
    payloadBuilder: (
      recipient: string,
      phoneNumberId: string,
    ) => Record<string, unknown>,
  ): Promise<DeliveryResult> {
    const config = this.getRequestConfig();
    if ('error' in config) {
      return { status: 'FAILED', detail: config.error };
    }

    const graphConfig = this.getGraphHeaders();
    if ('error' in graphConfig) {
      return { status: 'FAILED', detail: graphConfig.error };
    }

    try {
      const failures: string[] = [];
      const messagesUrl = this.getGraphMessagesUrl(config.phoneNumberId);

      for (const recipient of recipients) {
        const response = await this.postJson(
          messagesUrl,
          payloadBuilder(recipient, config.phoneNumberId),
          graphConfig.headers,
        );

        const failureDetail = this.getProviderFailureDetail(response);
        if (failureDetail) {
          failures.push(`${recipient}: ${failureDetail}`);
        }
      }

      if (failures.length) {
        return {
          status: 'FAILED',
          detail: `Provider request failed for ${failures.join(' | ')}`,
        };
      }

      return { status: 'SENT' };
    } catch (error) {
      return {
        status: 'FAILED',
        detail:
          error instanceof Error
            ? error.message
            : 'Unknown WhatsApp provider error.',
      };
    }
  }

  async sendMessage(
    recipients: string[],
    message: string,
  ): Promise<DeliveryResult> {
    if (!recipients.length) {
      return {
        status: 'FAILED',
        detail: 'No active WhatsApp recipients found.',
      };
    }

    return this.sendPayloadToRecipients(recipients, (recipient) => ({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient.replace(/^\+/, ''),
      type: 'text',
      text: {
        body: message,
      },
    }));
  }

  async sendTemplate(
    recipients: string[],
    template: TemplateSendInput,
  ): Promise<DeliveryResult> {
    if (!recipients.length) {
      return {
        status: 'FAILED',
        detail: 'No active WhatsApp recipients found.',
      };
    }

    return this.sendPayloadToRecipients(recipients, (recipient) => ({
      messaging_product: 'whatsapp',
      to: recipient.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: template.name,
        language: {
          code: template.languageCode || 'en',
        },
        components: template.parameters.length
          ? [
              {
                type: 'body',
                parameters: template.parameters.map((value) => ({
                  type: 'text',
                  text: value,
                })),
              },
            ]
          : undefined,
      },
    }));
  }

  async sendDocumentTemplate(
    recipients: string[],
    template: DocumentTemplateSendInput,
  ): Promise<DeliveryResult> {
    if (!recipients.length) {
      return {
        status: 'FAILED',
        detail: 'No active WhatsApp recipients found.',
      };
    }

    const config = this.getRequestConfig();
    if ('error' in config) {
      return { status: 'FAILED', detail: config.error };
    }

    const graphConfig = this.getGraphHeaders();
    if ('error' in graphConfig) {
      return { status: 'FAILED', detail: graphConfig.error };
    }

    try {
      const mediaId = await this.uploadDocumentMedia(
        config.phoneNumberId,
        graphConfig.headers,
        template.document,
      );
      const messagesUrl = this.getGraphMessagesUrl(config.phoneNumberId);
      const failures: string[] = [];

      for (const recipient of recipients) {
        const bodyParameters = (template.bodyParameters || []).map((value) => ({
          type: 'text',
          text: value,
        }));
        const components: Array<Record<string, unknown>> = [
          {
            type: 'header',
            parameters: [
              {
                type: 'document',
                document: {
                  id: mediaId,
                  filename: template.document.filename,
                },
              },
            ],
          },
        ];

        if (bodyParameters.length) {
          components.push({
            type: 'body',
            parameters: bodyParameters,
          });
        }

        const response = await this.postJson(
          messagesUrl,
          {
            messaging_product: 'whatsapp',
            to: recipient.replace(/^\+/, ''),
            type: 'template',
            template: {
              name: template.name,
              language: {
                code: template.languageCode || 'en',
              },
              components,
            },
          },
          graphConfig.headers,
        );

        const failureDetail = this.getProviderFailureDetail(response);
        if (failureDetail) {
          failures.push(`${recipient}: ${failureDetail}`);
        }
      }

      if (failures.length) {
        return {
          status: 'FAILED',
          detail: `Provider request failed for ${failures.join(' | ')}`,
        };
      }

      return { status: 'SENT' };
    } catch (error) {
      return {
        status: 'FAILED',
        detail:
          error instanceof Error
            ? error.message
            : 'Unknown WhatsApp provider error.',
      };
    }
  }
}
