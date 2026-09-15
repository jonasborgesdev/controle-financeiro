export interface Profile {
  id: string
  full_name: string | null
  email: string
  role: 'admin' | 'user'
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  type: 'personal' | 'business'
  bank: string | null
  description: string | null
  is_active: boolean
  color: string | null
  icon: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  name: string
  icon: string | null
  color: string | null
  type: 'income' | 'expense' | 'transfer'
  parent_id: string | null
  is_default: boolean
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: 'income' | 'expense' | 'transfer'
  amount: number
  description: string
  notes: string | null
  date: string
  source: 'manual' | 'imported' | 'asaas' | 'recurring'
  external_id: string | null
  is_confirmed: boolean
  is_recurring: boolean
  recurring_id: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>
      }
      accounts: {
        Row: Account
        Insert: Omit<Account, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at'>>
      }
      categories: {
        Row: Category
        Insert: Omit<Category, 'id' | 'created_at'>
        Update: Partial<Omit<Category, 'id' | 'created_at'>>
      }
      transactions: {
        Row: Transaction
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>
      }
    }
  }
}
