const TIME_ZONE = 'Asia/Tokyo';

const parts = (iso: string) => {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const map = Object.fromEntries(
    formatter
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    time: `${map.hour}:${map.minute}`,
  };
};

/** 投稿日時。今年なら年を省く（例: 11月15日 21:30） */
export const formatPostedAt = (iso: string, now = new Date()): string => {
  const date = parts(iso);
  const current = parts(now.toISOString());
  const day = `${date.month}月${date.day}日 ${date.time}`;
  return date.year === current.year ? day : `${date.year}年${day}`;
};

/** タイトル用の日付（例: 2026年11月15日） */
export const formatPostDate = (iso: string): string => {
  const date = parts(iso);
  return `${date.year}年${date.month}月${date.day}日`;
};
