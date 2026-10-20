export type GreetingKey = 'morning' | 'day' | 'evening' | 'night';

/**
 * Приветствие по времени суток на устройстве человека, а не сервера:
 * у клиента в другом часовом поясе «Доброе утро» должно совпадать с его утром.
 */
export function greetingKey(date: Date = new Date()): GreetingKey {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}
