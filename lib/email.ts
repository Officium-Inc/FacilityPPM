import nodemailer from 'nodemailer'

function createTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) throw new Error('GMAIL_USER or GMAIL_APP_PASSWORD env vars are not set')

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

export async function sendReceiptEmail({
  tenantEmail,
  tenantName,
  woNumber,
  propertyName,
  pdfBuffer,
}: {
  tenantEmail: string
  tenantName: string
  woNumber: string
  propertyName: string
  pdfBuffer: Buffer
}) {
  const transporter = createTransporter()
  await transporter.sendMail({
    from: `"Tenant360" <${process.env.GMAIL_USER}>`,
    to: tenantEmail,
    subject: `Signed Receipt: ${woNumber} — ${propertyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #15803d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Tenant360</h1>
          <p style="color: #bbf7d0; margin: 4px 0 0;">Tenant360 — Signed Acknowledgement Receipt</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>Dear ${tenantName},</p>
          <p>Thank you for signing off on work order <strong>${woNumber}</strong> for <strong>${propertyName}</strong>.</p>
          <p>Please find your tamper-evident acknowledgement receipt attached to this email as a PDF. Keep it for your records.</p>
          <p style="color: #6b7280; font-size: 14px;">If you have any questions or concerns, please contact Tenant360 directly.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Tenant360 · Tenant360</p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: `${woNumber}-receipt.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  })
}

export async function sendSignOffEmail({
  tenantEmail,
  tenantName,
  woNumber,
  propertyName,
  token,
}: {
  tenantEmail: string
  tenantName: string
  woNumber: string
  propertyName: string
  token: string
}) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  const signOffUrl = `${appUrl}/sign-off/${token}`

  const transporter = createTransporter()
  await transporter.sendMail({
    from: `"Tenant360" <${process.env.GMAIL_USER}>`,
    to: tenantEmail,
    subject: `Action Required: Please sign off on ${woNumber} ${propertyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1d4ed8; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Tenant360</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0;">Tenant360  Maintenance Sign-Off</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>Dear ${tenantName},</p>
          <p>Maintenance work order <strong>${woNumber}</strong> for <strong>${propertyName}</strong> has been completed and requires your sign-off.</p>
          <p>Please review the completed work and provide your digital signature using the secure link below:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signOffUrl}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
              Review &amp; Sign Off
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 48 hours. If you have concerns about the work performed, you can raise them directly on the sign-off page.</p>
          <p style="color: #6b7280; font-size: 14px;">If you did not expect this email, please contact Tenant360 immediately.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Tenant360 · Tenant360</p>
        </div>
      </div>
    `,
  })
}

export async function sendInviteEmail({
  toEmail,
  toName,
  propertyName,
  token,
  invitedBy,
}: {
  toEmail: string
  toName?: string
  propertyName: string
  token: string
  invitedBy?: string
}) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  const inviteUrl = `${appUrl}/invite/${token}`
  const greeting = toName ? `Hi ${toName},` : 'Hi,'

  const transporter = createTransporter()
  await transporter.sendMail({
    from: `"Tenant360" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `You've been invited to ${propertyName} on Tenant360`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1d4ed8; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Tenant360</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0;">Tenant360  Property Access Invitation</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>${greeting}</p>
          <p>${invitedBy ? `<strong>${invitedBy}</strong> has` : 'You have been'} invited you to join <strong>${propertyName}</strong> on Tenant360.</p>
          <p>Click the button below to accept your invitation and set up your account. This link expires in <strong>7 days</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you already have a Tenant360 account, you will be added to this property automatically.</p>
          <p style="color: #6b7280; font-size: 14px;">If you did not expect this invitation, you can safely ignore this email.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Tenant360 · Tenant360</p>
        </div>
      </div>
    `,
  })
}

export async function sendCostingApprovalConfirmationEmail({
  toEmail,
  toName,
  woNumber,
  propertyName,
  grandTotal,
  labourTotal,
  materialsTotal,
  subcontractorTotal,
  notes,
  approvedAt,
}: {
  toEmail: string
  toName?: string
  woNumber: string
  propertyName: string
  grandTotal: number
  labourTotal: number
  materialsTotal: number
  subcontractorTotal: number
  notes?: string | null
  approvedAt: string
}) {
  const greeting = toName ? `Dear ${toName},` : 'Dear Tenant,'
  const fmt = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(approvedAt))

  const transporter = createTransporter()
  await transporter.sendMail({
    from: `"Tenant360" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Cost Estimate Approved: ${woNumber} — ${propertyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #15803d; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Tenant360</h1>
          <p style="color: #bbf7d0; margin: 4px 0 0;">Tenant360 — Cost Estimate Approved</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>${greeting}</p>
          <p>You have approved the cost estimate for work order <strong>${woNumber}</strong> at <strong>${propertyName}</strong> on <strong>${dateStr} (PHT)</strong>.</p>
          <p>Below is your approved cost breakdown for your records:</p>
          <table style="width:100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr style="background: #f3f4f6;">
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">Labour</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">${fmt(labourTotal)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">Materials</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">${fmt(materialsTotal)}</td>
            </tr>
            <tr style="background: #f3f4f6;">
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">Subcontractor</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; text-align: right;">${fmt(subcontractorTotal)}</td>
            </tr>
            <tr style="font-weight: bold;">
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f0fdf4;">Total</td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f0fdf4; text-align: right; color: #15803d;">${fmt(grandTotal)}</td>
            </tr>
          </table>
          ${notes ? `<p style="color: #6b7280; font-size: 14px;"><em>Notes: ${notes}</em></p>` : ''}
          <p style="color: #6b7280; font-size: 14px;">Work on your request will now proceed. You will be notified again when the work is complete and requires your sign-off.</p>
          <p style="color: #6b7280; font-size: 14px;">If you have any questions, please contact Tenant360 directly.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Tenant360 · Tenant360</p>
        </div>
      </div>
    `,
  })
}

export async function sendMentionEmail({
  toEmail,
  toName,
  fromName,
  woNumber,
  propertyName,
  message,
  woLink,
}: {
  toEmail: string
  toName: string
  fromName: string
  woNumber: string
  propertyName: string
  message: string
  woLink: string
}) {
  const transporter = createTransporter()
  await transporter.sendMail({
    from: `"Tenant360" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `${fromName} mentioned you in ${woNumber} — ${propertyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1d4ed8; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Tenant360</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0;">Tenant360 — You were mentioned</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>Hi <strong>${toName}</strong>,</p>
          <p><strong>${fromName}</strong> mentioned you in a comment on work order <strong>${woNumber}</strong> (${propertyName}):</p>
          <div style="background: white; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 20px 0; border-radius: 0 8px 8px 0;">
            <p style="margin: 0; color: #374151; font-size: 15px;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${woLink}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
              View Work Order
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">You can reply directly in the Tenant360 portal.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Tenant360 · Tenant360</p>
        </div>
      </div>
    `,
  })
}

export async function sendCostingApprovalEmail({
  toEmail,
  toName,
  woNumber,
  propertyName,
  grandTotal,
  token,
}: {
  toEmail: string
  toName?: string
  woNumber: string
  propertyName: string
  grandTotal: number
  token: string
}) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  const approvalUrl = `${appUrl}/costing-approval/${token}`
  const greeting = toName ? `Dear ${toName},` : 'Dear Tenant,'

  const transporter = createTransporter()
  await transporter.sendMail({
    from: `"Tenant360" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `Cost Approval Required: ${woNumber}  ${propertyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1d4ed8; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Tenant360</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0;">Tenant360  Cost Estimate Approval</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>${greeting}</p>
          <p>A cost estimate has been prepared for work order <strong>${woNumber}</strong> at <strong>${propertyName}</strong>.</p>
          <p>The total estimated cost is <strong>‚${grandTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>. Please review the full breakdown and approve or reject using the link below.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${approvalUrl}" style="background: #16a34a; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
              Review Cost Estimate
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This approval link expires in 7 days. Approving this estimate authorises the work to proceed.</p>
          <p style="color: #6b7280; font-size: 14px;">If you have questions, please contact Tenant360 directly.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Tenant360 · Tenant360</p>
        </div>
      </div>
    `,
  })
}
