import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCompletedTaskCountsByUser, getLocalDateString } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get('session')?.value;

    if (!sessionUserId) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    // Which user's heatmap to fetch — defaults to the logged-in user
    const userId = searchParams.get('userId') || sessionUserId;

    // How many months to look back (default 12, max 24)
    const monthsParam = searchParams.get('months');
    const months = Math.min(Math.max(parseInt(monthsParam || '12', 10) || 12, 1), 24);

    // Compute endDate = today (shifted Algiers time) and startDate = months ago
    const endDate = getLocalDateString();

    const endDateObj = new Date(endDate + 'T12:00:00Z');
    endDateObj.setMonth(endDateObj.getMonth() - months);
    // Align startDate to the Sunday of the week it falls in so the grid is complete
    const dayOfWeek = endDateObj.getDay(); // 0=Sun
    endDateObj.setDate(endDateObj.getDate() - dayOfWeek);
    const startDate = endDateObj.toISOString().split('T')[0];

    const counts = await getCompletedTaskCountsByUser(userId, startDate, endDate);

    return NextResponse.json({
      userId,
      startDate,
      endDate,
      months,
      counts,
    });
  } catch (error) {
    console.error('Heatmap fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch heatmap data.' }, { status: 500 });
  }
}
