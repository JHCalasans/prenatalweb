import { InjectionToken } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Database } from '../../types/database.types';

export const SUPABASE_CLIENT = new InjectionToken<SupabaseClient<Database>>('supabase-client', {
  providedIn: 'root',
  factory: () => createClient<Database>(environment.supabase.url, environment.supabase.anonKey),
});
