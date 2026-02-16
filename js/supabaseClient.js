
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://ihmlvcbitzcubxjsxwnh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlobWx2Y2JpdHpjdWJ4anN4d25oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MzEwMTUsImV4cCI6MjA4NjQwNzAxNX0.EV00sC1NS0WEq9XZTma5pPWZfaBjmsXXrNk8kq1hbDI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export async function getUserProfile(walletAddress) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('wallet_address', walletAddress)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows found"
        console.error('Error fetching profile:', error);
        return null;
    }
    return data;
}

export async function createUserProfile(walletAddress, nickname = 'Guest') {
    const { data, error } = await supabase
        .from('profiles')
        .insert([
            { wallet_address: walletAddress, nickname: nickname }
        ])
        .select()
        .single();

    if (error) {
        console.error('Error creating profile:', error);
        return null;
    }
    return data;
}

export async function updateUserProfile(walletAddress, updates) {
    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('wallet_address', walletAddress)
        .select();

    if (error) {
        console.error('Error updating profile:', error);
    }
    return data;
}

export async function signInWithTwitter() {
    console.log("Attempting Twitter Sign-In...");
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'x',
        options: {
            redirectTo: window.location.origin + '/',
            scopes: 'tweet.read users.read offline.access'
        }
    });
    if (error) console.error("Twitter Sign-In Error:", error);
    if (data) console.log("Twitter Sign-In Data:", data);
    return { data, error };
}

export async function signInWithGoogle() {
    console.log("Attempting Google Sign-In...");
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/'
        }
    });
    if (error) console.error("Google Sign-In Error:", error);
    if (data) console.log("Google Sign-In Data:", data);
    return { data, error };
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
}

export async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    return { session: data?.session || null, error };
}
