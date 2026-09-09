export const OPENAPI_YAML = `openapi: 3.1.0
info:
  title: OG Job Book
  version: 0.1.0
  summary: Job → quote → invoice ledger HTTP API
  description: |
    Public hire-repo API for OG Job Book. No login. Australian English. AUD.

    POST /api/payment-webhook records a payment on an invoice (same rules as
    the Record payment form). GET /api/export downloads the books.

    This is not Stripe, not Confirmation of Payee, not tax advice, and not a BAS.
  license:
    name: UNLICENSED
servers:
  - url: /
    description: This deploy
paths:
  /api/payment-webhook:
    post:
      operationId: applyPaymentWebhook
      summary: Record a payment on an invoice
      description: |
        Inserts a payment. Marks the invoice paid when amount due now hits zero
        (total − paid − credits − retention held). Not a live card charge.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PaymentWebhookRequest"
            example:
              invoiceId: a0000000-0000-4000-8000-000000000042
              amountCents: 44000
              paidOn: "2026-09-09"
              method: transfer
      responses:
        "200":
          description: Payment applied
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PaymentWebhookResponse"
        "400":
          description: Empty or junk JSON body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PaymentWebhookResponse"
        "404":
          description: Invoice not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PaymentWebhookResponse"
        "409":
          description: Void invoice cannot take a payment
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PaymentWebhookResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PaymentWebhookResponse"
  /api/export:
    get:
      operationId: exportLedger
      summary: Download JSON, CSV, or BAS Check-shaped CSV
      description: |
        Sales lines for BAS Check column order are invoices and credit notes only.
        Quotes are stripped from that file. This is not a GST risk checker, not a
        bulk ABR lookup, and not a BAS.
      parameters:
        - name: format
          in: query
          required: true
          schema:
            type: string
            enum: [json, csv, bas-check]
        - name: from
          in: query
          required: false
          schema:
            type: string
            format: date
        - name: asAt
          in: query
          required: false
          schema:
            type: string
            format: date
          description: Empty as-at is today in Australia/Sydney.
      responses:
        "200":
          description: Attachment
          content:
            application/json:
              schema:
                type: string
            text/csv:
              schema:
                type: string
        "302":
          description: Junk format or dates redirect to /?error=export
components:
  schemas:
    PaymentWebhookRequest:
      type: object
      additionalProperties: false
      required: [invoiceId, amountCents, paidOn, method]
      properties:
        invoiceId:
          type: string
          format: uuid
        amountCents:
          type: integer
          minimum: 1
          description: Positive integer cents. Not dollars.
        paidOn:
          type: string
          format: date
        method:
          type: string
          enum: [cash, transfer, card]
    PaymentWebhookResponse:
      type: object
      required: [received, applied, note]
      properties:
        received:
          type: boolean
        applied:
          type: boolean
        note:
          type: string
        issues:
          type: array
          items:
            type: string
        paymentId:
          type: string
          format: uuid
        invoiceId:
          type: string
          format: uuid
        invoiceDocNumber:
          type: string
        jobId:
          type: string
          format: uuid
        remainingCents:
          type: integer
        invoiceStatus:
          type: string
`;

export function openapiDocumentsPath(path: string): boolean {
  return OPENAPI_YAML.includes(`  ${path}:`);
}
