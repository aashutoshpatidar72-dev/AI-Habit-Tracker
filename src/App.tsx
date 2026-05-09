import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { db, OperationType, handleFirestoreError } from './lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Home, 
  BarChart2, 
  Plus, 
  Bell, 
  User, 
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Award,
  Zap,
  Sparkles,
  Download,
  Settings,
  Trash2,
  X,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Flame,
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { suggestHabitsForUser } from './lib/gemini';
import { TotalActivitiesCard } from './components/TotalActivitiesCard';
import { cn } from './lib/utils';
import { Habit } from './types';

const DEFAULT_CATEGORIES = ['Health', 'Productivity', 'Mindfulness', 'Personal', 'Fitness', 'Learning'];

const getExpectedUnitsPerMonth = (habit: any, daysCount: number) => {
  const target = habit.targetValue || 1;
  if (habit.frequency === 'daily') return target * daysCount;
  if (habit.frequency === 'weekly') return target * (daysCount / 7);
  if (habit.frequency === 'monthly') return target;
  return target * daysCount;
};


// Analytics Component
const Analytics = () => {
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const { user, loading: authLoading } = useAuth();
  
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const getGuestUid = () => {
    let id = localStorage.getItem('guest_tracker_uid');
    if (!id) {
      id = 'guest_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('guest_tracker_uid', id);
    }
    return id;
  };

  const effectiveUid = user?.uid || getGuestUid();
  const currentMonthId = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const daysInMonthCount = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  
  const [gridData, setGridData] = useState<Record<string, (boolean | number)[]>>({});
  const [activeHabits, setActiveHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);

  const changeMonth = (delta: number) => {
    let newMonth = selectedMonth + delta;
    let newYear = selectedYear;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    setLoading(true);
  };

  const changeYear = (delta: number) => {
    setSelectedYear(prev => prev + delta);
    setLoading(true);
  };

  useEffect(() => {
    if (authLoading) return;

    async function loadData() {
      const monthPath = `users/${effectiveUid}/months/${currentMonthId}`;
      const userPath = `users/${effectiveUid}`;
      try {
        const [monthSnap, userSnap] = await Promise.all([
          getDoc(doc(db, monthPath)).catch(e => handleFirestoreError(e, OperationType.GET, monthPath)),
          getDoc(doc(db, userPath)).catch(e => handleFirestoreError(e, OperationType.GET, userPath))
        ]);

        if (monthSnap.exists()) {
          setGridData(monthSnap.data().gridData);
        }
        if (userSnap.exists()) {
          setActiveHabits(userSnap.data().activeHabits || []);
        }
      } catch (e) {
        console.error('Analytics data load error:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, authLoading, currentMonthId]);

  const calculateDailyProgress = (dayIdx: number, currentHabits: any[], grid: Record<string, (boolean | number)[]>) => {
    if (!currentHabits.length) return 0;
    let totalProgress = 0;
    currentHabits.forEach(h => {
      const val = grid[h.name]?.[dayIdx];
      if (h.goalType === 'numeric') {
        const progress = Math.min(1, (Number(val) || 0) / (h.targetValue || 1));
        totalProgress += progress;
      } else {
        totalProgress += val ? 1 : 0;
      }
    });
    return totalProgress / currentHabits.length;
  };

  // Calculate Weekly Data (Last 7 days of the selected period)
  const calculateWeeklyData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];
    
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    const referenceDate = isCurrentMonth ? new Date() : new Date(selectedYear, selectedMonth, daysInMonthCount);
    
    if (activeHabits.length === 0) {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(referenceDate);
        d.setDate(referenceDate.getDate() - i);
        result.push({ name: days[d.getDay()], value: 0 });
      }
      return result;
    }

    for (let i = 6; i >= 0; i--) {
      const d = new Date(referenceDate);
      d.setDate(referenceDate.getDate() - i);
      const dayName = days[d.getDay()];
      const dateNum = d.getDate();
      
      const isTargetMonth = d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      
      let completionRate = 0;
      if (isTargetMonth) {
        completionRate = Math.round(calculateDailyProgress(dateNum - 1, activeHabits, gridData) * 100);
      }
      
      result.push({ name: dayName, value: completionRate });
    }
    return result;
  };

  // Calculate Monthly Data (Weeks 1-5)
  const calculateMonthlyData = () => {
    const result = [];
    const habits = Object.values(gridData) as boolean[][];
    
    if (habits.length === 0) {
      return [
        { name: 'Wk 1', value: 0 },
        { name: 'Wk 2', value: 0 },
        { name: 'Wk 3', value: 0 },
        { name: 'Wk 4', value: 0 },
        { name: 'Wk 5', value: 0 },
      ];
    }

    const numWeeks = Math.ceil(daysInMonthCount / 7);

    for (let w = 0; w < numWeeks; w++) {
      const start = w * 7;
      const end = Math.min((w + 1) * 7, daysInMonthCount);
      let totalProgress = 0;
      let totalWeight = 0;

      activeHabits.forEach(h => {
        const days = gridData[h.name] || [];
        for (let i = start; i < end; i++) {
          const val = days[i];
          if (h.goalType === 'numeric') {
            totalProgress += Math.min(1, (Number(val) || 0) / (h.targetValue || 1));
          } else {
            totalProgress += val ? 1 : 0;
          }
          totalWeight++;
        }
      });

      const rate = totalWeight > 0 ? Math.round((totalProgress / totalWeight) * 100) : 0;
      result.push({ name: `Wk ${w + 1}`, value: rate });
    }
    return result;
  };

  const data = period === 'weekly' ? calculateWeeklyData() : calculateMonthlyData();

  if (loading) {
    return (
      <div className="p-4 md:p-12 h-screen flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-neon-green/20 border-t-neon-green rounded-full animate-spin mb-4" />
        <p className="text-gray-500 font-display font-medium animate-pulse">Analyzing Habits...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-12 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-4xl font-display font-bold text-white mb-2">Metrics</h2>
            <p className="text-gray-500">Track your performance and consistency over time.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => changeYear(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
                title="Previous Year"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[10px] bg-neon-green/20 text-neon-green px-3 py-1 rounded-full font-bold uppercase tracking-wider">{selectedYear}</span>
              <button 
                onClick={() => changeYear(1)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
                title="Next Year"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => changeMonth(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
                title="Previous Month"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <span className="text-[10px] bg-white/10 text-white px-4 py-1 rounded-full font-bold uppercase tracking-wider min-w-[100px] text-center border border-white/10">
                {new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long' })}
              </span>
              <button 
                onClick={() => changeMonth(1)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all border border-white/10"
                title="Next Month"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => setPeriod('weekly')}
            className={cn(
              "px-4 py-2 font-bold rounded-xl text-xs transition-all",
              period === 'weekly' ? "bg-neon-green text-black shadow-[0_0_10px_rgba(57,255,20,0.3)]" : "bg-white/5 text-gray-500 hover:text-white"
            )}
           >
            WEEKLY
           </button>
           <button 
            onClick={() => setPeriod('monthly')}
            className={cn(
              "px-4 py-2 font-bold rounded-xl text-xs transition-all",
              period === 'monthly' ? "bg-neon-green text-black shadow-[0_0_10px_rgba(57,255,20,0.3)]" : "bg-white/5 text-gray-500 hover:text-white"
            )}
           >
            MONTHLY
           </button>
        </div>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-[2.5rem] p-8 mb-8 overflow-hidden">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-8">Activity Pulse</h3>
        <div className="h-64 md:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#4B5563', fontSize: 10, fontWeight: 700 }}
                dy={10}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="glass p-3 rounded-xl border-neon-green/30 bg-black/80 backdrop-blur-md">
                        <p className="text-neon-green font-bold text-sm tracking-tighter">{`${payload[0].value}% Completion`}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="value" radius={[12, 12, 12, 12]}>
                {data.map((entry, index) => {
                  let color = '#1F1F1F'; // Default
                  if (entry.name === 'Wk 1') color = '#FDE047'; // Distinct Yellow for Week 1
                  else if (entry.value > 90) color = '#39FF14'; // Neon Green
                  else if (entry.value > 70) color = '#00F5FF'; // Cyan
                  else if (entry.value > 50) color = '#7B2CBF'; // Purple
                  else if (entry.value > 30) color = '#FF007F'; // Pink
                  
                  return (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={color} 
                      fillOpacity={(entry.value > 30 || entry.name === 'Wk 1') ? 1 : 0.4}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-dark-card border border-dark-border rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center group hover:border-neon-green/30 transition-all">
            <span className="text-neon-green text-5xl font-display font-bold mb-2 tracking-tighter">
              {(() => {
                if (activeHabits.length === 0) return '0%';
                let totalProgress = 0;
                let totalSlots = activeHabits.length * daysInMonthCount;

                activeHabits.forEach(h => {
                  const days = gridData[h.name] || [];
                  if (h.goalType === 'numeric') {
                    const totalValue = days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
                    totalProgress += totalValue / (h.targetValue || 1);
                  } else {
                    totalProgress += days.filter(Boolean).length;
                  }
                });

                return totalSlots > 0 ? `${Math.round((totalProgress / totalSlots) * 100)}%` : '0%';
              })()}
            </span>
            <span className="text-gray-500 text-xs uppercase font-bold tracking-[0.2em]">Monthly Rate</span>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center group hover:border-neon-green/30 transition-all">
            <span className="text-white text-5xl font-display font-bold mb-2 tracking-tighter">
              {(() => {
                let totalDone = 0;
                activeHabits.forEach(h => {
                  const days = gridData[h.name] || [];
                  if (h.goalType === 'numeric') {
                    totalDone += days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
                  } else {
                    totalDone += days.filter(Boolean).length;
                  }
                });
                return Math.round(totalDone);
              })()}
            </span>
            <span className="text-gray-500 text-xs uppercase font-bold tracking-[0.2em]">Total Units Done</span>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center group hover:border-neon-green/30 transition-all lg:col-span-1 md:col-span-2 lg:col-span-1">
            <span className="text-neon-green text-5xl font-display font-bold mb-2 tracking-tighter">
              {Object.keys(gridData).length}
            </span>
            <span className="text-gray-500 text-xs uppercase font-bold tracking-[0.2em]">Active Habits</span>
        </div>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-[2.5rem] p-10">
        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-10 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Category Performance
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {DEFAULT_CATEGORIES.map((cat, i) => {
            const habitsInCat = activeHabits.filter(h => h.category === cat);
            if (habitsInCat.length === 0) return null;

            let totalProgress = 0;
            let totalWeight = 0;

            habitsInCat.forEach(h => {
              const days = gridData[h.name] || [];
              const unitsDone = h.goalType === 'numeric'
                ? days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0)
                : days.filter(Boolean).length;
              
              const expected = getExpectedUnitsPerMonth(h, daysInMonthCount);
              totalProgress += unitsDone;
              totalWeight += expected;
            });

            const rate = totalWeight > 0 ? Math.round((totalProgress / totalWeight) * 100) : 0;
            const catColor = habitsInCat[0]?.color || '#00FF00';

            return (
              <div key={cat} className="space-y-3 p-6 bg-white/[0.02] rounded-3xl border border-white/5">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-white/80">
                  <span>{cat}</span>
                  <span style={{ color: rate >= 70 ? catColor : '#6B7280' }}>{rate}%</span>
                </div>
                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, rate)}%` }}
                    className="h-full transition-all duration-1000" 
                    style={{ backgroundColor: catColor }}
                  />
                </div>
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-tighter">
                  {rate >= 70 ? "Consistent Progress" : "Increase frequency"}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Focus = () => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'work' | 'break'>('work');

  useEffect(() => {
    let interval: any = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      clearInterval(interval);
      setIsActive(false);
      // Play sound or notification logic could go here
      const nextMode = mode === 'work' ? 'break' : 'work';
      setMode(nextMode);
      setTimeLeft(nextMode === 'work' ? 25 * 60 : 5 * 60);
      alert(`${mode === 'work' ? 'Work' : 'Break'} session finished!`);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'work' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = (timeLeft / (mode === 'work' ? 25 * 60 : 5 * 60)) * 100;

  return (
    <div className="p-4 md:p-12 pb-32 flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-display font-bold text-white mb-2">Focus Mode</h2>
        <p className="text-gray-500">Stay concentrated on your goals using Pomodoro.</p>
      </div>

      <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
        {/* Progress Ring */}
        <svg className="w-full h-full transform -rotate-90 absolute">
          <circle 
            cx="50%" cy="50%" r="45%" 
            fill="transparent" 
            stroke="currentColor" 
            strokeWidth="8" 
            className="text-white/5" 
          />
          <motion.circle 
            cx="50%" cy="50%" r="45%" 
            fill="transparent" 
            stroke="currentColor" 
            strokeWidth="8" 
            strokeDasharray="283%" 
            animate={{ strokeDashoffset: `${283 - (283 * (100 - progress)) / 100}%` }}
            className="text-neon-green" 
            strokeLinecap="round"
          />
        </svg>

        <div className="relative z-10 flex flex-col items-center">
          <span className="text-xs font-bold text-neon-green uppercase tracking-[0.3em] mb-4">
            {mode === 'work' ? 'Time to Focus' : 'Take a Break'}
          </span>
          <span className="text-7xl md:text-8xl font-display font-bold text-white tracking-tighter">
            {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      <div className="flex gap-6 mt-16">
        <button 
          onClick={resetTimer}
          className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <RotateCcw className="w-8 h-8" />
        </button>
        <button 
          onClick={toggleTimer}
          className="w-20 h-20 rounded-[2.5rem] bg-neon-green text-black flex items-center justify-center shadow-[0_0_30px_rgba(57,255,20,0.4)] hover:scale-105 active:scale-95 transition-all"
        >
          {isActive ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-1" />}
        </button>
        <button 
          onClick={() => {
            const nextMode = mode === 'work' ? 'break' : 'work';
            setMode(nextMode);
            setTimeLeft(nextMode === 'work' ? 25 * 60 : 5 * 60);
            setIsActive(false);
          }}
          className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all text-xs font-bold"
        >
          {mode === 'work' ? 'BREAK' : 'WORK'}
        </button>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-4 w-full max-w-sm">
        <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center">
          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Sessions</p>
          <p className="text-2xl font-display font-bold text-white">4 / 8</p>
        </div>
        <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center">
          <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Focus Time</p>
          <p className="text-2xl font-display font-bold text-neon-green">1h 40m</p>
        </div>
      </div>
    </div>
  );
};

const Notifications = () => {
    const notifications = [
    { title: 'Morning Run', time: '2 mins ago', desc: 'You completed your 5km run 12% faster than yesterday!', icon: <Zap className="w-5 h-5 text-neon-green" />, type: 'achievement' },
    { title: 'Goal Achieved!', time: '1 hour ago', desc: 'Daily hydration goal met. 7 days streak!', icon: <Award className="w-5 h-5 text-neon-green" />, type: 'achievement' },
    { title: 'Water Reminder', time: '3 hours ago', desc: 'Time to drink some water and stay focused.', icon: <Bell className="w-5 h-5 text-gray-400" />, type: 'alert' },
    { title: 'Sleep Analysis', time: '12 hours ago', desc: 'Your sleep quality was 85% last night. Excellent recovery.', icon: <Sparkles className="w-5 h-5 text-neon-green" />, type: 'report' },
    { title: 'Weekly Review', time: '1 day ago', desc: 'Your weekly performance report is ready to view.', icon: <BarChart2 className="w-5 h-5 text-gray-400" />, type: 'report' },
  ];

  const [selectedNotify, setSelectedNotify] = useState<any>(null);

  return (
    <div className="p-4 md:p-12 pb-32">
      <div className="mb-12">
        <h2 className="text-4xl font-display font-bold text-white mb-2">Alerts</h2>
        <p className="text-gray-500">Stay updated with your latest achievements and reminders.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {notifications.map((n, i) => (
          <div key={i} className="glass p-6 rounded-[2.5rem] border-white/5 hover:border-white/10 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                {n.icon}
              </div>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{n.time}</span>
            </div>
            <h4 className="font-bold text-lg text-white mb-2">{n.title}</h4>
            <p className="text-sm text-gray-400 leading-relaxed mb-6 line-clamp-2">{n.desc}</p>
            <button 
              onClick={() => setSelectedNotify(n)}
              className="text-[10px] font-bold text-neon-green uppercase tracking-[0.2em] hover:underline underline-offset-4"
            >
              VIEW DETAILS
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedNotify && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setSelectedNotify(null)}
               className="absolute inset-0 bg-black/60 backdrop-blur-md"
             />
             <motion.div 
               initial={{ y: "100%" }}
               animate={{ y: 0 }}
               exit={{ y: "100%" }}
               className="relative w-full max-w-lg bg-dark-bg border-t md:border border-white/10 rounded-t-[2.5rem] md:rounded-[3rem] p-10"
             >
                <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-8 md:hidden" />
                <div className="flex items-center gap-6 mb-8">
                   <div className="w-16 h-16 bg-neon-green/10 rounded-3xl flex items-center justify-center text-3xl">
                     {selectedNotify.icon}
                   </div>
                   <div>
                     <span className="text-[10px] text-neon-green font-bold uppercase tracking-widest">{selectedNotify.time}</span>
                     <h3 className="text-2xl font-display font-bold text-white">{selectedNotify.title}</h3>
                   </div>
                </div>
                <p className="text-gray-400 mb-10 leading-relaxed">{selectedNotify.desc}</p>
                <button 
                  onClick={() => setSelectedNotify(null)}
                  className="w-full py-5 bg-neon-green text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  DISMISS
                </button>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
const Profile = () => {
  const { user } = useAuth();
  const [avatarSeed, setAvatarSeed] = useState(user?.displayName || 'Guest');

  return (
    <div className="p-4 md:p-12 pb-32">
      <div className="mb-12">
        <h2 className="text-4xl font-display font-bold text-white mb-2">Profile</h2>
        <p className="text-gray-500">Manage your account and preferences.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-dark-card border border-dark-border rounded-[2.5rem] p-10 flex flex-col items-center text-center">
            <div className="w-32 h-32 rounded-[2.5rem] bg-neon-green p-1.5 mb-6 rotate-3">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`} alt="Avatar" className="w-full h-full rounded-[2rem] bg-dark-bg -rotate-3" />
            </div>
            <h2 className="text-3xl font-display font-bold text-white mb-1">{user?.displayName || 'Alex Johnson'}</h2>
            <p className="text-neon-green text-sm font-bold uppercase tracking-widest mb-6">{user?.email || 'Premium Member'}</p>
            <button 
              onClick={() => setAvatarSeed(Math.random().toString(36).substring(7))}
              className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-bold text-sm hover:bg-white/10 transition-colors"
            >
              Edit Avatar
            </button>
          </div>

          <div className="glass rounded-[2.5rem] p-8 border-white/5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-6">User Stats</h3>
            <div className="space-y-6">
              {[
                { label: 'Longest Streak', val: '14 Days' },
                { label: 'Total XP', val: '1,240' },
                { label: 'Achievements', val: '12' },
              ].map((s, i) => (
                <div key={i} className="flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                  <span className="text-sm text-gray-400 font-medium">{s.label}</span>
                  <span className="text-sm text-white font-bold">{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          {[
            { label: 'Account Security', desc: 'Manage password and 2FA', icon: <User className="w-6 h-6" /> },
            { label: 'Notification Settings', desc: 'Configure push and email alerts', icon: <Bell className="w-6 h-6" /> },
            { label: 'Platform Appearance', desc: 'Custom themes and layouts', icon: <TrendingUp className="w-6 h-6" /> },
            { label: 'Billing & Subscription', desc: 'Manage your pro plan', icon: <Award className="w-6 h-6" /> },
            { label: 'Privacy Policy', desc: 'Read our data protection rules', icon: <ChevronRight className="w-6 h-6" /> },
          ].map((item, i) => (
            <button key={i} className="w-full flex items-center justify-between p-6 glass rounded-[2rem] group transition-all hover:bg-white/[0.04] border border-white/5">
              <div className="flex items-center gap-6 text-left">
                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-neon-green group-hover:bg-neon-green/10 group-hover:scale-110 transition-all">{item.icon}</div>
                <div>
                  <span className="block font-bold text-lg text-white group-hover:text-neon-green transition-colors">{item.label}</span>
                  <span className="text-xs text-gray-500">{item.desc}</span>
                </div>
              </div>
              <ChevronRight className="w-6 h-6 text-gray-600 group-hover:text-neon-green transition-all group-hover:translate-x-1" />
            </button>
          ))}
          
          <button 
            onClick={() => {
              // Removed confirm for reliability in iframe
              localStorage.removeItem('guest_tracker_uid');
              window.location.reload();
            }}
            className="w-full mt-8 py-5 bg-red-500/10 text-red-500 font-bold rounded-[2rem] border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-lg hover:shadow-red-500/30"
          >
            Deactivate Guest Session
          </button>
        </div>
      </div>
    </div>
  );
};


const Dashboard = () => {
  const getGuestUid = () => {
    let id = localStorage.getItem('guest_tracker_uid');
    if (!id) {
      id = 'guest_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('guest_tracker_uid', id);
    }
    return id;
  };

  const { user, loading: authLoading } = useAuth();
  const effectiveUid = user?.uid || getGuestUid();
  
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(now.getDate());
  
  const daysInMonthCount = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const daysInMonth = Array.from({ length: daysInMonthCount }, (_, i) => i + 1);
  const currentMonthId = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [userBirthYear, setUserBirthYear] = useState(1995);
  const [gridData, setGridData] = useState<Record<string, (boolean | number)[]>>({});
  const [loading, setLoading] = useState(true);
  const [activeHabits, setActiveHabits] = useState<Habit[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitIcon, setNewHabitIcon] = useState('✨');
  const [newHabitCategory, setNewHabitCategory] = useState('Personal');
  const [newHabitColor, setNewHabitColor] = useState('#00FF00'); // Default to neon green
  const [goalType, setGoalType] = useState<'boolean' | 'numeric'>('boolean');
  const [targetValue, setTargetValue] = useState(1);
  const [unit, setUnit] = useState('times');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const getDayName = (day: number) => {
    return weekDays[new Date(selectedYear, selectedMonth, day).getDay()];
  };

  const defaultHabits: Habit[] = [
    { name: 'Eat clean (No junk food ❌)', icon: '🥗', id: '1', goal: daysInMonthCount, category: 'Health', frequency: 'daily', color: '#FF3366' },
    { name: 'Exercise / Workout', icon: '💪', id: '2', goal: daysInMonthCount, category: 'Health', frequency: 'daily', color: '#00FF00' },
    { name: 'Drink 1 big cup milk (morning)', icon: '🥛', id: '3', goal: daysInMonthCount, category: 'Health', frequency: 'daily', color: '#33CCFF' },
    { name: 'Prayer + Gratitude', icon: '🙏', id: '4', goal: daysInMonthCount, category: 'Mindfulness', frequency: 'daily', color: '#FFCC33' },
    { name: 'Wake up at 5:30–6:00 AM', icon: '🌅', id: '5', goal: daysInMonthCount, category: 'Productivity', frequency: 'daily', color: '#FF6600' },
    { name: 'Make your bed', icon: '🛏️', id: '6', goal: daysInMonthCount, category: 'Productivity', frequency: 'daily', color: '#CC33FF' },
    { name: 'Meditation (5–10 min)', icon: '🧘', id: '7', goal: daysInMonthCount, category: 'Mindfulness', frequency: 'daily', color: '#00FA9A' },
    { name: 'Deep Study (4–6 hours)', icon: '📚', id: '8', goal: daysInMonthCount, category: 'Productivity', frequency: 'daily', color: '#4169E1' },
    { name: '🚰 Drink 3–4L water (total)', icon: '🚰', id: '9', goal: daysInMonthCount, category: 'Health', frequency: 'daily', color: '#00CED1' },
  ];

  const HABIT_COLORS = [
    '#00FF00', // Neon Green
    '#FF3366', // Neon Pink
    '#33CCFF', // Neon Blue
    '#FFCC33', // Neon Gold
    '#FF6600', // Neon Orange
    '#CC33FF', // Neon Purple
    '#00FA9A', // Medium Spring Green
    '#4169E1', // Royal Blue
    '#00CED1', // Dark Turquoise
    '#FF1493', // Deep Pink
  ];

  const loadSuggestions = async (y: number) => {
    if (loadingSuggestions) return;
    setLoadingSuggestions(true);
    try {
      const res = await suggestHabitsForUser(y);
      setSuggestions(res);
      
      // Cache suggestions in Firestore if valid
      if (Array.isArray(res) && res.length > 0) {
        const userPath = `users/${effectiveUid}`;
        await setDoc(doc(db, userPath), { 
          aiSuggestions: res 
        }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, userPath));
      }
    } catch (e) {
      console.error("Failed to load suggestions:", e);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    async function loadData() {
      const monthPath = `users/${effectiveUid}/months/${currentMonthId}`;
      const userPath = `users/${effectiveUid}`;
      try {
        const docRefs = [doc(db, userPath), doc(db, monthPath)];
        const [userSnap, monthSnap] = await Promise.all(
          docRefs.map(ref => getDoc(ref).catch(e => handleFirestoreError(e, OperationType.GET, ref.path)))
        );

        let currentHabits = defaultHabits;
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.activeHabits) {
            currentHabits = userData.activeHabits;
          }
          const birthYear = userData.birthYear || 1995;
          setUserBirthYear(birthYear);
          
          if (userData.aiSuggestions && Array.isArray(userData.aiSuggestions)) {
            setSuggestions(userData.aiSuggestions);
          } else if (suggestions.length === 0 && !loadingSuggestions && !(suggestions as any)?.error) {
            loadSuggestions(birthYear);
          }
        } else {
          setUserBirthYear(1995);
          loadSuggestions(1995);
          // Create initial user doc
          const userDoc = {
            uid: effectiveUid,
            displayName: user?.displayName || 'New Member',
            email: user?.email || 'member@habitect.ai',
            birthYear: 1995,
            createdAt: Date.now(),
            activeHabits: defaultHabits,
            stats: { streaks: 0, completions: 0 }
          };
          await setDoc(doc(db, userPath), userDoc).catch(e => handleFirestoreError(e, OperationType.WRITE, userPath));
        }
        setActiveHabits(currentHabits);

        if (monthSnap.exists()) {
          setGridData(monthSnap.data().gridData);
        } else {
          const data: Record<string, boolean[]> = {};
          currentHabits.forEach(h => {
            data[h.name] = Array(daysInMonthCount).fill(false);
          });
          setGridData(data);
          
          const monthDoc = {
            userId: effectiveUid,
            monthId: currentMonthId,
            gridData: data,
            updatedAt: Date.now()
          };
          await setDoc(doc(db, monthPath), monthDoc).catch(e => handleFirestoreError(e, OperationType.WRITE, monthPath));
        }
      } catch (e) {
        console.error('Data load error:', e);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, authLoading, currentMonthId]);

  const calculateCurrentStreak = (habit: Habit) => {
    const days = gridData[habit.name];
    if (!days) return 0;
    
    // Check if we are viewing the current month
    const now = new Date();
    const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
    
    // If future month, streak is 0. If past month, calculate from end of month.
    // However, usually "streak" implies "up to now".
    if (!isCurrentMonth && (selectedYear > now.getFullYear() || (selectedYear === now.getFullYear() && selectedMonth > now.getMonth()))) {
      return 0;
    }

    const startIdx = isCurrentMonth ? now.getDate() - 1 : daysInMonthCount - 1;
    let streak = 0;
    
    // We check from today backwards
    for (let i = startIdx; i >= 0; i--) {
      const val = days[i];
      const isCompleted = habit.goalType === 'numeric' 
        ? (Number(val) || 0) >= (habit.targetValue || 1)
        : !!val;
      
      if (isCompleted) {
        streak++;
      } else {
        // If we found a gap but we are looking at "today" (startIdx), 
        // it might be that they haven't done today yet.
        // If so, we continue to check from yesterday.
        if (i === startIdx && !isCompleted) {
          continue;
        }
        break;
      }
    }
    return streak;
  };

  const toggleDay = async (habitName: string, dayIdx: number, increment?: number, absoluteValue?: number) => {
    const habit = activeHabits.find(h => h.name === habitName);
    const path = `users/${effectiveUid}/months/${currentMonthId}`;
    const prevData = { ...gridData };
    const newData = { ...prevData };
    const newDays = [...(newData[habitName] || Array(daysInMonthCount).fill(habit?.goalType === 'numeric' ? 0 : false))];
    
    if (habit?.goalType === 'numeric') {
      if (absoluteValue !== undefined) {
        newDays[dayIdx] = Math.max(0, absoluteValue);
      } else {
        const currentVal = Number(newDays[dayIdx]) || 0;
        newDays[dayIdx] = Math.max(0, currentVal + (increment ?? 1));
      }
    } else {
      newDays[dayIdx] = !newDays[dayIdx];
    }
    
    newData[habitName] = newDays;
    setGridData(newData);

    try {
      await setDoc(doc(db, path), {
        gridData: newData,
        userId: effectiveUid,
        monthId: currentMonthId,
        updatedAt: Date.now()
      }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, path));
    } catch (e) {
      setGridData(prevData);
      console.error('Toggle error:', e);
    }
  };

  const addHabit = async (name: string, icon: string, category: string = 'Personal') => {
    if (!name.trim()) return;
    const newHabit: Habit = { 
      name, 
      icon, 
      id: Date.now().toString(), 
      goal: daysInMonthCount, 
      category,
      color: newHabitColor,
      goalType,
      targetValue: goalType === 'numeric' ? targetValue : 1,
      unit: goalType === 'numeric' ? unit : 'times',
      frequency
    };
    const updatedHabits = [...activeHabits, newHabit];
    
    // Update locally
    setActiveHabits(updatedHabits);
    const newGrid = { ...gridData, [name]: Array(daysInMonthCount).fill(goalType === 'numeric' ? 0 : false) };
    setGridData(newGrid);

    try {
      // Update User Meta
      await setDoc(doc(db, `users/${effectiveUid}`), { activeHabits: updatedHabits }, { merge: true })
        .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${effectiveUid}`));
      
      // Update Month Grid
      const monthPath = `users/${effectiveUid}/months/${currentMonthId}`;
      await setDoc(doc(db, monthPath), { 
        gridData: newGrid,
        userId: effectiveUid,
        monthId: currentMonthId,
        updatedAt: Date.now() 
      }, { merge: true }).catch(e => handleFirestoreError(e, OperationType.WRITE, monthPath));
      
      setIsAddModalOpen(false);
      setNewHabitName('');
      setNewHabitColor('#00FF00');
      // Reset goal fields
      setGoalType('boolean');
      setTargetValue(1);
      setUnit('times');
      setFrequency('daily');
    } catch (e) {
      console.error('Add habit error:', e);
    }
  };

  const deleteHabit = async (habitId: string) => {
    console.log('Attempting to delete habit with ID:', habitId);
    try {
      const habitToRemove = activeHabits.find(h => h.id === habitId) || activeHabits.find(h => h.name === habitId);
      if (!habitToRemove) {
        console.warn('Habit not found for deletion:', habitId);
        return;
      }

      console.log('Found habit to remove:', habitToRemove.name);

      // Removed window.confirm because it might be blocked in some iframe environments
      // if (!window.confirm(`Are you sure you want to delete "${habitToRemove.name}"? This will also remove its history for this month.`)) return;

      const updatedHabits = activeHabits.filter(h => h.id !== habitToRemove.id && h.name !== habitToRemove.name);
      
      // Update locally immediately for responsiveness
      setActiveHabits(updatedHabits);
      const newGrid = { ...gridData };
      delete newGrid[habitToRemove.name];
      setGridData(newGrid);
      console.log('Local state updated, syncing with Firebase...');

      // Update User Meta
      await setDoc(doc(db, `users/${effectiveUid}`), { activeHabits: updatedHabits }, { merge: true })
        .catch(e => {
          console.error('Firebase User Meta Sync Error:', e);
          handleFirestoreError(e, OperationType.WRITE, `users/${effectiveUid}`);
        });
      
      // Update Month Grid - Completely overwrite to remove the deleted key
      const monthPath = `users/${effectiveUid}/months/${currentMonthId}`;
      await setDoc(doc(db, monthPath), { 
        gridData: newGrid,
        userId: effectiveUid,
        monthId: currentMonthId,
        updatedAt: Date.now() 
      }).then(() => {
        console.log('Firebase Month Grid Sync Success');
      }).catch(e => {
        console.error('Firebase Month Grid Sync Error:', e);
        handleFirestoreError(e, OperationType.WRITE, monthPath);
      });
      
    } catch (e) {
      console.error('Delete habit error:', e);
    }
  };

  const exportCSV = () => {
    const headers = ['Habit', ...daysInMonth.map(d => `Day ${d}`)].join(',');
    const rows = (activeHabits).map((habit) => {
      const days = gridData[habit.name] || Array(daysInMonthCount).fill(habit.goalType === 'numeric' ? 0 : false);
      return [`"${habit.name}"`, ...days.map(val => habit.goalType === 'numeric' ? val : (val ? 'YES' : 'NO'))].join(',');
    });
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `habit_tracker_${currentMonthId}.csv`);
    link.click();
  };

  const calculateDailyProgressDashboard = (dayIdx: number) => {
    if (!activeHabits.length) return 0;
    let totalProgress = 0;
    activeHabits.forEach(h => {
      const val = gridData[h.name]?.[dayIdx];
      if (h.goalType === 'numeric') {
        const progress = Math.min(1, (Number(val) || 0) / (h.targetValue || 1));
        totalProgress += progress;
      } else {
        totalProgress += val ? 1 : 0;
      }
    });
    return totalProgress / activeHabits.length;
  };

  const getCompletedCountMonthly = () => {
    let totalProgress = 0;
    activeHabits.forEach(h => {
      const days = gridData[h.name] || [];
      if (h.goalType === 'numeric') {
        const totalValue = days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0);
        totalProgress += Math.min(days.length, totalValue / (h.targetValue || 1));
      } else {
        totalProgress += days.filter(Boolean).length;
      }
    });
    return Math.round(totalProgress);
  };

  const getCompletedCountDaily = () => {
    let done = 0;
    activeHabits.forEach(h => {
      const val = gridData[h.name]?.[selectedDate - 1];
      if (h.goalType === 'numeric') {
        if (Number(val) >= (h.targetValue || 1)) done++;
      } else {
        if (val) done++;
      }
    });
    return done;
  };

  const changeMonth = (delta: number) => {
    let newMonth = selectedMonth + delta;
    let newYear = selectedYear;
    
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
    // Reset selected date if it exceeds days in new month
    const newDaysInMonth = new Date(newYear, newMonth + 1, 0).getDate();
    if (selectedDate > newDaysInMonth) {
      setSelectedDate(newDaysInMonth);
    }
  };

  const changeYear = (delta: number) => {
    const newYear = selectedYear + delta;
    setSelectedYear(newYear);
    // Reset selected date if it exceeds days in new month (e.g. Feb 29 in non-leap year)
    const newDaysInMonth = new Date(newYear, selectedMonth + 1, 0).getDate();
    if (selectedDate > newDaysInMonth) {
      setSelectedDate(newDaysInMonth);
    }
  };

  const totalPossibleDaily = activeHabits.length;
  const completedCountDaily = getCompletedCountDaily();
  const progressPercentDaily = totalPossibleDaily > 0 ? Math.round((completedCountDaily / totalPossibleDaily) * 100) : 0;

  // Real Monthly Data for Widget
  const calculateMonthWidgetData = () => {
    return Array.from({ length: daysInMonthCount }, (_, i) => {
      if (activeHabits.length === 0) return { day: (i + 1).toString(), progress: 0 };
      const rate = calculateDailyProgressDashboard(i);
      return { day: (i + 1).toString(), progress: rate };
    });
  };

  const calculateOverallMonthPercentage = () => {
    if (activeHabits.length === 0) return 0;
    let totalProgress = 0;
    let totalPossible = 0;
    
    activeHabits.forEach(h => {
      const days = gridData[h.name] || [];
      const unitsDone = h.goalType === 'numeric'
        ? days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0)
        : days.filter(Boolean).length;
      
      totalProgress += unitsDone;
      totalPossible += getExpectedUnitsPerMonth(h, daysInMonthCount);
    });
    
    return totalPossible > 0 ? Math.round((totalProgress / totalPossible) * 100) : 0;
  };

  // Temporarily log for debugging as requested
  useEffect(() => {
    console.log('--- Stats Debug ---');
    console.log('Total Habits:', totalPossibleDaily);
    console.log('Completed Today:', completedCountDaily);
    console.log('Progress %:', progressPercentDaily);
    console.log('Selected Date:', selectedDate);
    console.log('Current Month:', currentMonthId);
  }, [totalPossibleDaily, completedCountDaily, progressPercentDaily, selectedDate, currentMonthId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-neon-green/20 border-t-neon-green rounded-full animate-spin" />
          <p className="text-gray-500 font-display font-medium animate-pulse">Syncing Tracker...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 px-4 md:px-8">
      {/* Excel Header Highlights */}
      <div className="mt-8 overflow-hidden rounded-[2.5rem] bg-neon-green/10 border border-white/5">
        <div className="p-8 md:p-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="flex flex-col gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => changeYear(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                    title="Previous Year"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-[10px] bg-neon-green/20 text-neon-green px-3 py-1 rounded-full font-bold uppercase tracking-wider">{selectedYear}</span>
                  <button 
                    onClick={() => changeYear(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                    title="Next Year"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => changeMonth(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] bg-white/10 text-white px-3 py-1 rounded-full font-bold uppercase tracking-wider min-w-[100px] text-center">
                    {new Date(selectedYear, selectedMonth).toLocaleString('default', { month: 'long' })}
                  </span>
                  <button 
                    onClick={() => changeMonth(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-white transition-all"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-2">Daily Progress</h2>
              <p className="text-neon-green text-sm flex items-center gap-2 font-bold">
                <Zap className="w-5 h-5 fill-current" />
                {getCompletedCountMonthly()} Habits Completed This Month
              </p>
            </div>
            <div className="hidden md:flex gap-4">
              <div className="w-14 h-14 glass rounded-2xl flex items-center justify-center text-white relative">
                <Bell className="w-7 h-7" />
                <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-neon-green rounded-full shadow-[0_0_8px_#39FF14]" />
              </div>
              <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white">
                <Settings className="w-7 h-7" />
              </div>
            </div>
          </div>

          {/* Date Selector removed from here */}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Goal Progress Section (Match Excel Overview) */}
        <div className="p-8 glass rounded-[2.5rem] border-neon-green/10 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-8">
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Total Performance</h3>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-display font-bold text-white tracking-tighter">{progressPercentDaily}%</span>
                  <span className="text-sm text-neon-green font-medium">Growth Target Met</span>
                </div>
              </div>
              <div className="w-24 h-24 relative">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="48" cy="48" r="42" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                  <circle cx="48" cy="48" r="42" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray={263.9} strokeDashoffset={263.9 - (263.9 * progressPercentDaily / 100)} className="text-neon-green" strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-neon-green">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-6 border-t border-white/5 pt-8">
              <div className="space-y-1">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Done Today</p>
                <p className="text-2xl font-display font-medium text-white">{completedCountDaily}</p>
              </div>
              <div className="space-y-1 border-x border-white/5 px-2">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Left Today</p>
                <p className="text-2xl font-display font-medium text-gray-500">{totalPossibleDaily - completedCountDaily}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Total Daily</p>
                <p className="text-2xl font-display font-medium text-neon-green">{totalPossibleDaily}</p>
              </div>
            </div>
          </div>
        </div>

        {/* TOTAL ACTIVITIES WIDGET (Modern Premium Design) */}
        <div className="flex justify-center lg:justify-end">
          <div className="w-full max-w-[400px]">
            <TotalActivitiesCard 
              monthlyProgress={calculateMonthWidgetData()} 
              totalPercentage={calculateOverallMonthPercentage()} 
            />
          </div>
        </div>
      </div>

      {/* DETAILED HABIT TRACKER GRID (EXCEL STYLE) */}
      <div className="mt-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between items-start mb-6 gap-4">
          <div>
            <h3 className="text-2xl font-display font-bold text-white">Habit Ledger</h3>
            <p className="text-sm text-gray-500 mb-6">Record your daily actions to build lasting routines.</p>
            
            {/* Date Selector (Moved here from Daily Progress) */}
            <div className="flex items-center gap-4 overflow-x-auto no-scrollbar pb-6">
              {daysInMonth.map((d, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    "flex flex-col items-center p-4 rounded-3xl min-w-[65px] transition-all",
                    selectedDate === d ? "bg-neon-green text-black font-bold neon-glow scale-105" : "bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300"
                  )}
                >
                  <span className="text-[10px] uppercase font-bold tracking-widest mb-2 opacity-60">{getDayName(d)}</span>
                  <span className="text-xl">{d}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
             <button 
              onClick={() => setIsDeleteMode(!isDeleteMode)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-all",
                isDeleteMode 
                  ? "bg-red-500/20 border-red-500/50 text-red-500" 
                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
              )}
             >
               {isDeleteMode ? <X className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
               {isDeleteMode ? 'Cancel' : 'Remove'}
             </button>
             <button 
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition-colors"
             >
               <Download className="w-4 h-4" /> Export CSV
             </button>
             <button 
              onClick={() => {
                setIsAddModalOpen(true);
                setIsDeleteMode(false);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-neon-green text-black rounded-xl text-xs font-bold hover:shadow-[0_0_15px_rgba(57,255,20,0.3)] transition-all"
             >
               <Plus className="w-4 h-4" /> Add Goal
             </button>
          </div>
        </div>
        
        <div className="bg-dark-card border border-dark-border rounded-[2.5rem] overflow-hidden shadow-2xl">
          <div className="overflow-x-auto no-scrollbar scroll-smooth">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.02]">
                  <th className="sticky left-0 z-20 bg-dark-card border-r border-white/5 p-6 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] min-w-[200px]">Goal Habits</th>
                  {daysInMonth.map(day => (
                    <th key={day} className="p-3 text-[10px] font-bold text-center text-gray-600 min-w-[45px] hover:text-neon-green transition-colors cursor-default">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const grouped: Record<string, any[]> = {};
                  activeHabits.forEach(h => {
                    const cat = h.category || 'Other';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(h);
                  });

                  return Object.entries(grouped).map(([category, habits]) => (
                    <React.Fragment key={category}>
                      <tr className="bg-white/5">
                        <td colSpan={daysInMonthCount + 1} className="py-3 px-6">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-neon-green uppercase tracking-[0.3em]">{category}</span>
                            <div className="h-px flex-1 bg-neon-green/10" />
                          </div>
                        </td>
                      </tr>
                      {habits.map((habit) => {
                        const name = habit.name;
                        const days = gridData[name] || Array(daysInMonthCount).fill(habit.goalType === 'numeric' ? 0 : false);
                        const habitIcon = habit.icon || '✨';
                        
                        // Progress calculation logic
                        const unitsDone = habit.goalType === 'numeric'
                          ? days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0)
                          : days.filter(Boolean).length;
                        
                        const expectedUnits = getExpectedUnitsPerMonth(habit, daysInMonthCount);
                        const habitProgress = expectedUnits > 0 ? Math.round((unitsDone / expectedUnits) * 100) : 0;

                        return (
                          <tr key={habit.id} className="border-t border-white/5 group hover:bg-white/[0.02] transition-colors">
                            <td className="sticky left-0 z-20 bg-dark-card border-r border-white/5 p-6 group-hover:bg-dark-card/90">
                              <div className="flex items-center gap-4">
                                 {isDeleteMode && (
                                  <motion.button 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const identifier = habit.id || habit.name;
                                      console.log('Delete button clicked for:', identifier);
                                      deleteHabit(identifier);
                                    }}
                                    className="z-50 w-8 h-8 flex-shrink-0 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg shadow-red-500/30"
                                    title="Delete Habit"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </motion.button>
                                )}
                                <div className="w-10 h-10 rounded-xl glass flex items-center justify-center text-xl group-hover:bg-neon-green/20 group-hover:border-neon-green/50 transition-all border border-transparent">
                                  {habitIcon}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white truncate max-w-[120px] leading-tight">{name}</span>
                                    {(() => {
                                      const streak = calculateCurrentStreak(habit);
                                      return streak > 1 ? (
                                        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-400">
                                          <Flame className="w-2.5 h-2.5" />
                                          <span className="text-[10px] font-black">{streak}</span>
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    {habit.targetValue > 0 && (
                                      <span className="text-[9px] text-gray-500 font-bold uppercase">
                                        Goal: {habit.targetValue} {habit.unit} / {habit.frequency === 'daily' ? 'day' : habit.frequency === 'weekly' ? 'week' : 'month'}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full transition-all duration-500" 
                                        style={{ 
                                          width: `${Math.min(100, habitProgress)}%`,
                                          backgroundColor: habit.color || '#00FF00'
                                        }} 
                                      />
                                    </div>
                                    <span 
                                      className="text-[8px] font-bold uppercase"
                                      style={{ color: habit.color || '#00FF00' }}
                                    >
                                      {habitProgress}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            {days.map((val: any, i: number) => (
                              <td key={i} className="p-2 text-center">
                                {habit.goalType === 'numeric' ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <input 
                                      type="number"
                                      defaultValue={val}
                                      key={`${habit.id}-${i}-${val}`}
                                      onBlur={(e) => {
                                        const newVal = Number(e.target.value);
                                        if (newVal !== Number(val)) {
                                          toggleDay(name, i, undefined, newVal);
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          const newVal = Number((e.target as HTMLInputElement).value);
                                          if (newVal !== Number(val)) {
                                            toggleDay(name, i, undefined, newVal);
                                          }
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      className="w-10 bg-transparent text-center text-xs font-bold transition-all focus:outline-none focus:bg-white/5 rounded py-0.5"
                                      style={{ color: Number(val) >= habit.targetValue ? (habit.color || '#00FF00') : '#666' }}
                                    />
                                    <div className="flex gap-1">
                                      <button 
                                        onClick={() => toggleDay(name, i, -1)}
                                        className="w-5 h-5 rounded bg-white/5 border border-white/10 flex items-center justify-center text-[10px] hover:bg-white/10"
                                      >
                                        -
                                      </button>
                                      <button 
                                        onClick={() => toggleDay(name, i, 1)}
                                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] transition-all"
                                        style={{ 
                                          backgroundColor: Number(val) >= habit.targetValue ? (habit.color || '#00FF00') : 'rgba(255,255,255,0.05)',
                                          color: Number(val) >= habit.targetValue ? '#000' : '#fff',
                                          border: Number(val) >= habit.targetValue ? 'none' : '1px solid rgba(255,255,255,0.1)'
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => toggleDay(name, i)}
                                    className="w-7 h-7 rounded-lg transition-all flex items-center justify-center border-2 mx-auto"
                                    style={{
                                      backgroundColor: val ? (habit.color || '#00FF00') : 'rgba(255,255,255,0.05)',
                                      borderColor: val ? (habit.color || '#00FF00') : 'rgba(255,255,255,0.1)',
                                      color: '#000'
                                    }}
                                  >
                                    {val && <div className="w-2 h-2 bg-black rounded-sm" />}
                                  </button>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
        {/* TOP HABITS LIST (EXCEL STYLE SIDEBAR) */}
        <div className="p-8 bg-dark-card border border-dark-border rounded-[2.5rem]">
          <h3 className="text-xl font-display font-bold mb-8">Top Performance</h3>
          <div className="space-y-4">
            {activeHabits.slice(0, 5).map((habit, i) => {
              const days = gridData[habit.name] || [];
              const unitsDone = habit.goalType === 'numeric'
                ? days.reduce((acc: number, curr: any) => acc + (Number(curr) || 0), 0)
                : days.filter(Boolean).length;
              
              const expectedUnits = getExpectedUnitsPerMonth(habit, daysInMonthCount);
              const progress = expectedUnits > 0 ? Math.round((unitsDone / expectedUnits) * 100) : 0;

              return (
                <div key={habit.id} className="glass p-5 rounded-3xl flex items-center justify-between border-white/5 group hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-5">
                    {isDeleteMode && (
                      <motion.button 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const identifier = habit.id || habit.name;
                          console.log('Mobile Delete button clicked for:', identifier);
                          deleteHabit(identifier);
                        }}
                        className="z-50 w-8 h-8 flex-shrink-0 rounded-lg bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 mr-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    )}
                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      {habit.icon}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-sm text-white">{habit.name}</h4>
                        {(() => {
                           const streak = calculateCurrentStreak(habit);
                           return streak > 1 ? (
                             <div className="flex items-center gap-1 text-orange-400">
                               <Flame className="w-3 h-3 fill-orange-400" />
                               <span className="text-[10px] font-black">{streak} day streak</span>
                             </div>
                           ) : null;
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full transition-all duration-500" 
                              style={{ 
                                width: `${Math.min(100, progress)}%`,
                                backgroundColor: habit.color || '#00FF00'
                              }} 
                            />
                        </div>
                        <p 
                          className="text-[10px] font-bold uppercase"
                          style={{ color: habit.color || '#00FF00' }}
                        >
                          {progress}%
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-xs font-bold text-gray-500">
                    #{i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* AI Recommendations */}
        <div className="p-8 glass rounded-[2.5rem] border-neon-green/10">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-neon-green" />
              <h3 className="text-xl font-display font-bold">Suggested Goals</h3>
            </div>
            <button 
              onClick={() => loadSuggestions(userBirthYear)}
              className="text-[10px] font-bold text-neon-green uppercase tracking-widest border border-neon-green/30 px-3 py-1 rounded-full hover:bg-neon-green hover:text-black transition-all"
            >
              Refresh
            </button>
          </div>
          
          <div className="space-y-4">
            {loadingSuggestions ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-white/5 animate-pulse rounded-3xl" />
                ))}
              </div>
            ) : (!Array.isArray(suggestions) && (suggestions as any)?.error === 'RATE_LIMIT') ? (
              <div className="p-8 bg-neon-green/5 border border-neon-green/20 rounded-3xl text-center">
                <Clock className="w-8 h-8 text-neon-green mx-auto mb-4" />
                <h4 className="text-white font-bold mb-2">AI is Overloaded</h4>
                <p className="text-xs text-gray-500">{(suggestions as any).message}</p>
                <button 
                  onClick={() => loadSuggestions(userBirthYear)}
                  className="mt-6 px-4 py-2 bg-neon-green text-black text-[10px] font-bold rounded-xl uppercase tracking-widest"
                >
                  Try Again
                </button>
              </div>
            ) : suggestions.length === 0 ? (
               <div className="p-8 bg-white/5 rounded-3xl text-center text-gray-500 italic text-sm">
                 No suggestions available. Try refreshing.
               </div>
            ) : (suggestions as any[]).map((s, i) => (
              <div key={i} className="bg-white/5 p-6 rounded-3xl flex flex-col gap-4 border border-transparent hover:border-neon-green/20 transition-all group">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-5">
                    <div className="w-14 h-14 bg-neon-green/10 rounded-[1.25rem] flex items-center justify-center text-3xl group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white mb-1.5">{s.name}</h4>
                      <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-neon-green/10 border border-neon-green/20">
                        <p className="text-[9px] text-neon-green font-bold uppercase tracking-widest">{s.category}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-[10px] bg-white/5 px-2 py-1 rounded text-gray-500 font-bold">RECOM #{i+1}</div>
                </div>
                
                <div className="space-y-3">
                  <p className="text-sm text-gray-400 leading-relaxed italic">{s.desc}</p>
                  
                  {s.why && (
                    <div className="p-4 bg-neon-green/5 rounded-2xl border border-neon-green/10">
                      <p className="text-[10px] font-bold text-neon-green uppercase tracking-widest mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Why this habit?
                      </p>
                      <p className="text-xs text-gray-300 leading-relaxed font-medium">
                        {s.why}
                      </p>
                    </div>
                  )}
                </div>

                <button 
                  onClick={() => addHabit(s.name, s.icon, s.category)}
                  className="w-full mt-2 py-4 bg-white/5 rounded-2xl flex items-center justify-center gap-2 group-hover:bg-neon-green group-hover:text-black transition-all hover:scale-[1.02] active:scale-[0.98] font-bold text-sm"
                >
                  <Plus className="w-5 h-5" />
                  ADD TO GOALS
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Habit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-dark-card border border-white/10 rounded-[2.5rem] p-8"
            >
              <h3 className="text-2xl font-display font-bold text-white mb-6">Create New Goal</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Goal Name</label>
                  <input 
                    type="text" 
                    value={newHabitName}
                    onChange={(e) => setNewHabitName(e.target.value)}
                    placeholder="e.g., Morning Run"
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-neon-green transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Icon (Emoji)</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {['✨', '🏃', '💪', '📚', '🥦', '💧', '🧘', '🎨', '🎸', '🛌'].map(emoji => (
                      <button 
                        key={emoji}
                        onClick={() => setNewHabitIcon(emoji)}
                        className={cn(
                          "w-12 h-12 flex items-center justify-center rounded-xl text-2xl transition-all",
                          newHabitIcon === emoji ? "bg-neon-green text-black scale-110" : "bg-white/5 text-white hover:bg-white/10"
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Goal Type</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setGoalType('boolean')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all flex flex-col items-center gap-2",
                        goalType === 'boolean' ? "bg-neon-green/10 border-neon-green text-neon-green" : "bg-white/5 border-white/10 text-gray-500"
                      )}
                    >
                      <Zap className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Yes/No Goal</span>
                    </button>
                    <button 
                      onClick={() => setGoalType('numeric')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all flex flex-col items-center gap-2",
                        goalType === 'numeric' ? "bg-neon-green/10 border-neon-green text-neon-green" : "bg-white/5 border-white/10 text-gray-500"
                      )}
                    >
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Count Goal</span>
                    </button>
                  </div>
                </div>

                {goalType === 'numeric' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Target</label>
                      <input 
                        type="number" 
                        min="1"
                        value={targetValue}
                        onChange={(e) => setTargetValue(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-neon-green transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Unit</label>
                      <input 
                        type="text" 
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        placeholder="e.g., pages"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-neon-green transition-colors"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Frequency</label>
                  <div className="flex gap-2">
                    {(['daily', 'weekly', 'monthly'] as const).map(f => (
                      <button 
                        key={f}
                        onClick={() => setFrequency(f)}
                        className={cn(
                          "flex-1 px-3 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border",
                          frequency === f 
                            ? "bg-white/10 border-white/30 text-white" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Colours</label>
                  <div className="flex flex-wrap gap-3">
                    {HABIT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setNewHabitColor(color)}
                        className={cn(
                          "w-8 h-8 rounded-full transition-all border-2",
                          newHabitColor === color ? "border-white scale-125" : "border-transparent opacity-60 hover:opacity-100"
                        )}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Category</label>
                  <div className="flex flex-wrap gap-2 pb-2">
                    {DEFAULT_CATEGORIES.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setNewHabitCategory(cat)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border",
                          newHabitCategory === cat 
                            ? "bg-neon-green/20 border-neon-green text-neon-green" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => addHabit(newHabitName, newHabitIcon, newHabitCategory)}
                  disabled={!newHabitName.trim()}
                  className="w-full py-4 bg-neon-green text-black font-bold rounded-2xl disabled:opacity-50 disabled:grayscale transition-all"
                >
                  ADD TO LEDGER
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Layout = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: <Home className="w-6 h-6" />, label: 'Dashboard', path: '/' },
    { icon: <BarChart2 className="w-6 h-6" />, label: 'Analytics', path: '/analytics' },
    { icon: <Clock className="w-6 h-6" />, label: 'Focus', path: '/focus' },
    { icon: <Bell className="w-6 h-6" />, label: 'Alerts', path: '/notifications' },
    { icon: <User className="w-6 h-6" />, label: 'Profile', path: '/profile' },
  ];

  return (
    <div className="min-h-screen flex bg-dark-bg text-white overflow-hidden">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex w-72 flex-col bg-dark-card border-r border-dark-border p-8 shrink-0">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 bg-neon-green rounded-xl flex items-center justify-center text-black font-bold shadow-[0_0_15px_rgba(57,255,20,0.3)]">H</div>
          <span className="font-display font-bold text-xl tracking-tight">HABITECT</span>
        </div>

        <nav className="flex-1 space-y-4">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-medium group",
                location.pathname === item.path 
                  ? "bg-neon-green/10 text-neon-green border border-neon-green/20" 
                  : "text-gray-500 hover:bg-white/5 hover:text-white"
              )}
            >
              <span className={cn(
                "transition-colors",
                location.pathname === item.path ? "text-neon-green" : "text-gray-500 group-hover:text-white"
              )}>
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-6 bg-neon-green/5 border border-neon-green/10 rounded-[2rem] text-center">
          <p className="text-xs font-bold text-neon-green uppercase mb-2">Upgrade to Pro</p>
          <p className="text-[10px] text-gray-500 mb-4 px-2">Unlock unlimited habits and advanced analytics.</p>
          <button className="w-full py-3 bg-neon-green text-black font-bold rounded-xl text-xs hover:shadow-[0_0_20px_rgba(57,255,20,0.3)] transition-shadow">
            GO PREMIUM
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto no-scrollbar pb-32 md:pb-8">
          <div className="max-w-5xl mx-auto w-full">
            {children}
          </div>
        </div>
        
        {/* Bottom Nav - Mobile Only */}
        <div className="md:hidden absolute bottom-6 left-6 right-6 h-20 glass rounded-[2.5rem] flex items-center justify-around px-8 z-50">
          {navItems.map((item) => (
            <button 
              key={item.path}
              onClick={() => navigate(item.path)} 
              className={cn(
                "transition-all active:scale-110",
                location.pathname === item.path ? "text-neon-green" : "text-gray-500"
              )}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};


export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout><Dashboard /></Layout>} />
          <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
          <Route path="/notifications" element={<Layout><Notifications /></Layout>} />
          <Route path="/focus" element={<Layout><Focus /></Layout>} />
          <Route path="/profile" element={<Layout><Profile /></Layout>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
