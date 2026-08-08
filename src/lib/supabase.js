import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qcmlzjrrwiqsdltbkvtn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjbWx6anJyd2lxc2RsdGJrdnRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5NDI0NDcsImV4cCI6MjA3NjUxODQ0N30.dI9VvYqwkvatMCxBLv-zKdJls-jMDJ2vrBGB47BX5u0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
