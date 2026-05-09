export interface Habit {
  id: string;
  name: string;
  icon: string;
  category: string;
  goal: number;
  goalType?: 'boolean' | 'numeric';
  targetValue?: number;
  unit?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  color?: string;
  progress?: number; // 0 to 1
  streak?: number;
  reminderTime?: string;
  createdAt?: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  birthYear?: number;
  stats: {
    totalCompleted: number;
    currentStreak: number;
    completionRate: number;
  };
}
