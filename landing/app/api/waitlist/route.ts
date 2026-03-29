import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    // Log in development
    console.log("[WAITLIST]", email);

    // In production with Resend configured, you would:
    // if (process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID) {
    //   const resend = new Resend(process.env.RESEND_API_KEY);
    //   await resend.contacts.create({
    //     audienceId: process.env.RESEND_AUDIENCE_ID,
    //     email,
    //   });
    // }

    return NextResponse.json({
      success: true,
      message: `Successfully joined waitlist with email: ${email}`,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
