import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@facilityppm.com'

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  const signOffUrl = `${appUrl}/sign-off/${token}`

  const { error } = await resend.emails.send({
    from: FROM,
    to: tenantEmail,
    subject: `Action Required: Please sign off on ${woNumber} — ${propertyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1d4ed8; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Marajo Property Management</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0;">FacilityPPM — Maintenance Sign-Off</p>
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
          <p style="color: #6b7280; font-size: 14px;">If you did not expect this email, please contact Marajo Property Management immediately.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Marajo Property Management · FacilityPPM</p>
        </div>
      </div>
    `,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not set')
  const inviteUrl = `${appUrl}/invite/${token}`
  const greeting = toName ? `Hi ${toName},` : 'Hi,'

  const { error } = await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `You've been invited to ${propertyName} on FacilityPPM`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1d4ed8; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">Marajo Property Management</h1>
          <p style="color: #bfdbfe; margin: 4px 0 0;">FacilityPPM — Property Access Invitation</p>
        </div>
        <div style="padding: 32px 24px; background: #f9fafb;">
          <p>${greeting}</p>
          <p>${invitedBy ? `<strong>${invitedBy}</strong> has` : 'You have been'} invited you to join <strong>${propertyName}</strong> on FacilityPPM.</p>
          <p>Click the button below to accept your invitation and set up your account. This link expires in <strong>7 days</strong>.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${inviteUrl}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">If you already have a FacilityPPM account, you will be added to this property automatically.</p>
          <p style="color: #6b7280; font-size: 14px;">If you did not expect this invitation, you can safely ignore this email.</p>
        </div>
        <div style="padding: 16px 24px; background: #e5e7eb; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} Marajo Property Management · FacilityPPM</p>
        </div>
      </div>
    `,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)
}
