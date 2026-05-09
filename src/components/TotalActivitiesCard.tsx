import React from 'react';
import { motion } from 'motion/react';

interface ActivityBarProps {
  day: string;
  progress: number; // 0 to 1
}

const ActivityBar: React.FC<ActivityBarProps> = ({ day, progress }) => {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="w-3 h-24 bg-emerald-950/5 rounded-full relative overflow-hidden backdrop-blur-sm">
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${progress * 100}%` }}
          transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }}
          className="absolute bottom-0 left-0 right-0 bg-emerald-950 rounded-full"
        />
      </div>
      <span className="text-[10px] font-bold text-emerald-950/30 uppercase tracking-widest">{day}</span>
    </div>
  );
};

interface TotalActivitiesCardProps {
  monthlyProgress: { day: string; progress: number }[];
  totalPercentage: number;
}

export const TotalActivitiesCard: React.FC<TotalActivitiesCardProps> = ({ monthlyProgress, totalPercentage }) => {
  return (
    <div className="w-full aspect-square bg-[#d4ff33] rounded-[3rem] p-10 shadow-[0_30px_60px_rgba(0,0,0,0.12)] flex flex-col justify-between border border-emerald-950/10 ring-1 ring-emerald-950/5 hover:scale-[1.01] transition-all duration-500 cursor-default group overflow-hidden">
      <div className="space-y-1">
        <h3 className="text-[10px] font-black text-emerald-950/30 uppercase tracking-[0.3em] mb-2">Activities Score</h3>
        <p className="text-8xl font-display font-bold text-emerald-950 tracking-tighter leading-none">{totalPercentage}%</p>
      </div>

      <div className="mt-8 overflow-x-auto pb-4 analytics-scrollbar no-scrollbar">
        <div className="flex gap-4 items-end px-1 min-w-max">
          {monthlyProgress.map((data, index) => (
            <ActivityBar key={index} day={data.day} progress={data.progress} />
          ))}
        </div>
      </div>
    </div>
  );
};
