export const OPENAPI_YAML = `openapi: 3.1.0
info:
  title: OG Job Book
  version: 0.1.0
  summary: Job → quote → invoice ledger HTTP API
  description: |
    Public hire-repo API for OG Job Book. Recruiter demo has no login when Clerk
    keys are unset. Australian English. AUD.

    POST /api/payment-webhook records a payment on an invoice (same rules as
    the Record payment form). POST /api/stripe-checkout starts a Stripe Checkout
    Session for the amount due now when STRIPE_SECRET_KEY and
    STRIPE_WEBHOOK_SECRET are set. POST /api/stripe-webhook records that card
    payment. POST /api/send-email emails a sent quote or a live invoice to the
    customer address when Resend is configured. POST /api/accounting-write posts a
    live invoice to Xero or MYOB (full lines, not amount due now). Credit notes
    go to Xero only. POST /api/quote-share mints or rotates a share token for a
    sent quote (GET /q/{token} is the customer-facing page). POST /api/queue-run
    enqueues due recurring invoices on Redis with BullMQ when REDIS_URL is set.
    GET /api/export downloads the books.

    Optional Clerk: when CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    are set, ledger APIs return 401 until sign-in. GET /q/{token},
    POST /api/payment-webhook, and POST /api/stripe-webhook stay public.
    Leave Clerk keys unset on a public no-login deploy.

    This is not Confirmation of Payee, not tax advice, not a BAS,
    not a customer portal, and not Xero OAuth. Leave Stripe, Resend, Xero, MYOB,
    Clerk, and Redis keys unset on a public no-login deploy.
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
  /api/stripe-checkout:
    post:
      operationId: createStripeCheckout
      summary: Start Stripe Checkout for an invoice
      description: |
        Charges the amount due now (total − paid − credits − retention held) in
        AUD via Stripe Checkout. Off until STRIPE_SECRET_KEY and
        STRIPE_WEBHOOK_SECRET are set. Leave those unset on a public no-login
        deploy. Not Confirmation of Payee.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/StripeCheckoutRequest"
            example:
              invoiceId: a0000000-0000-4000-8000-000000000042
      responses:
        "200":
          description: Checkout Session created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeCheckoutResponse"
        "400":
          description: Empty or junk JSON body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeCheckoutResponse"
        "404":
          description: Invoice not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeCheckoutResponse"
        "409":
          description: Not chargeable (keys unset, draft, void, no amount due now)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeCheckoutResponse"
        "502":
          description: Stripe HTTP or parse error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeCheckoutResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeCheckoutResponse"
  /api/stripe-webhook:
    post:
      operationId: applyStripeWebhook
      summary: Record a card payment from Stripe
      description: |
        Verifies Stripe-Signature and applies checkout.session.completed as a
        card payment. Amount due now of zero is treated as already recorded
        (idempotent retry). Off until STRIPE_WEBHOOK_SECRET. Not Confirmation
        of Payee.
      responses:
        "200":
          description: Event received (applied or ignored)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeWebhookResponse"
        "400":
          description: Missing signature or junk event body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeWebhookResponse"
        "404":
          description: Invoice not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeWebhookResponse"
        "409":
          description: Keys unset, void invoice, or draft invoice
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeWebhookResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/StripeWebhookResponse"
  /api/send-email:
    post:
      operationId: sendDocumentEmail
      summary: Email a quote or invoice to the customer
      description: |
        Posts the document via Resend to the customer email on the job.
        Off until RESEND_API_KEY and EMAIL_FROM are set. Leave those unset on
        a public no-login deploy. Not a mailbox. Not Stripe.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/SendEmailRequest"
            example:
              kind: quote
              id: a0000000-0000-4000-8000-000000000021
      responses:
        "200":
          description: Email accepted by Resend
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendEmailResponse"
        "400":
          description: Empty or junk JSON body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendEmailResponse"
        "404":
          description: Quote or invoice not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendEmailResponse"
        "409":
          description: Not sendable (key unset, no customer email, draft, void, superseded)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendEmailResponse"
        "502":
          description: Resend HTTP or parse error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendEmailResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SendEmailResponse"
  /api/accounting-write:
    post:
      operationId: writeAccountingDocument
      summary: Post an invoice or credit note to Xero or MYOB
      description: |
        Writes a sent or paid invoice as a Xero ACCREC invoice or a MYOB
        service sale. Credit notes write to Xero only (ACCRECCREDIT). Amount
        is the document total, not amount due now. Off until Xero or MYOB
        tokens are set. Leave those unset on a public no-login deploy. Not
        OAuth. Not a BAS.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/AccountingWriteRequest"
            example:
              provider: xero
              kind: invoice
              id: a0000000-0000-4000-8000-000000000042
      responses:
        "200":
          description: Remote document created
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AccountingWriteResponse"
        "400":
          description: Empty or junk JSON body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AccountingWriteResponse"
        "404":
          description: Invoice or credit note not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AccountingWriteResponse"
        "409":
          description: Not writable (keys unset, draft, void, MYOB credit)
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AccountingWriteResponse"
        "502":
          description: Xero or MYOB HTTP or parse error
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AccountingWriteResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/AccountingWriteResponse"
  /api/quote-share:
    post:
      operationId: mintQuoteShare
      summary: Mint or rotate a quote share token
      description: |
        Returns /q/{token} for a sent, accepted, declined, or superseded quote.
        Drafts are not shared. Rotate invalidates the old token.
        Not a customer portal. Not an invoice.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/QuoteShareRequest"
            example:
              quoteId: a0000000-0000-4000-8000-000000000021
              rotate: false
      responses:
        "200":
          description: Token minted or returned
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QuoteShareResponse"
        "400":
          description: Empty or junk JSON body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QuoteShareResponse"
        "404":
          description: Quote not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QuoteShareResponse"
        "409":
          description: Draft or otherwise not shareable
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QuoteShareResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QuoteShareResponse"
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
  /api/queue-run:
    post:
      operationId: queueDueRecurring
      summary: Queue due recurring invoices
      description: |
        Enqueues due recurring templates on Redis with BullMQ, then issues one
        period each (same as Issue due invoice). Empty JSON is a sweep.
        Off until REDIS_URL. Not a booking calendar. Not email.
      requestBody:
        required: false
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/QueueRunRequest"
            example:
              kind: sweep
      responses:
        "200":
          description: Jobs queued
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
        "400":
          description: Junk JSON body
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
        "401":
          description: Clerk is on and the caller is not signed in
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
        "404":
          description: Recurring invoice not found
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
        "409":
          description: Redis unset, or the template is not due
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
        "502":
          description: Redis is configured but not reachable
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
        "503":
          description: Postgres is not connected
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/QueueRunResponse"
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
    StripeCheckoutRequest:
      type: object
      additionalProperties: false
      required: [invoiceId]
      properties:
        invoiceId:
          type: string
          format: uuid
    StripeCheckoutResponse:
      type: object
      required: [created, skipped, note]
      properties:
        created:
          type: boolean
        skipped:
          type: boolean
        note:
          type: string
        issues:
          type: array
          items:
            type: string
        reason:
          type: string
        id:
          type: string
        url:
          type: string
        invoiceId:
          type: string
          format: uuid
        docNumber:
          type: string
        jobId:
          type: string
          format: uuid
        remainingCents:
          type: integer
    StripeWebhookResponse:
      type: object
      required: [received, applied, note]
      properties:
        received:
          type: boolean
        applied:
          type: boolean
        note:
          type: string
        reason:
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
        stripeSessionId:
          type: string
    SendEmailRequest:
      type: object
      additionalProperties: false
      required: [kind, id]
      properties:
        kind:
          type: string
          enum: [quote, invoice]
        id:
          type: string
          format: uuid
    SendEmailResponse:
      type: object
      required: [sent, skipped, note]
      properties:
        sent:
          type: boolean
        skipped:
          type: boolean
        note:
          type: string
        issues:
          type: array
          items:
            type: string
        reason:
          type: string
        id:
          type: string
        documentId:
          type: string
          format: uuid
        docNumber:
          type: string
        jobId:
          type: string
          format: uuid
    AccountingWriteRequest:
      type: object
      additionalProperties: false
      required: [provider, kind, id]
      properties:
        provider:
          type: string
          enum: [xero, myob]
        kind:
          type: string
          enum: [invoice, credit]
        id:
          type: string
          format: uuid
    AccountingWriteResponse:
      type: object
      required: [written, skipped, note]
      properties:
        written:
          type: boolean
        skipped:
          type: boolean
        note:
          type: string
        issues:
          type: array
          items:
            type: string
        reason:
          type: string
        id:
          type: string
        documentId:
          type: string
          format: uuid
        docNumber:
          type: string
        jobId:
          type: string
          format: uuid
        provider:
          type: string
        kind:
          type: string
    QuoteShareRequest:
      type: object
      additionalProperties: false
      required: [quoteId]
      properties:
        quoteId:
          type: string
          format: uuid
        rotate:
          type: boolean
    QuoteShareResponse:
      type: object
      required: [minted, skipped, note]
      properties:
        minted:
          type: boolean
        skipped:
          type: boolean
        note:
          type: string
        issues:
          type: array
          items:
            type: string
        reason:
          type: string
        token:
          type: string
        path:
          type: string
        quoteId:
          type: string
          format: uuid
        docNumber:
          type: string
        jobId:
          type: string
          format: uuid
    QueueRunRequest:
      type: object
      additionalProperties: false
      properties:
        kind:
          type: string
          enum: [sweep, issue-recurring]
        recurringInvoiceId:
          type: string
          format: uuid
    QueueRunResponse:
      type: object
      required: [queued, skipped, note]
      properties:
        queued:
          type: boolean
        skipped:
          type: boolean
        note:
          type: string
        issues:
          type: array
          items:
            type: string
        reason:
          type: string
        ids:
          type: array
          items:
            type: string
        queuedCount:
          type: integer
        issued:
          type: integer
        skippedCount:
          type: integer
`;

export function openapiDocumentsPath(path: string): boolean {
  return OPENAPI_YAML.includes(`  ${path}:`);
}
