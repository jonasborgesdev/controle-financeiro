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
  initial_balance: number
  is_active: boolean
  color: string | null
  icon: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string | null
  name: string
  icon: string | null
  color: string | null
  type: 'income' | 'expense' | 'transfer'
  parent_id: string | null
  is_default: boolean
  is_active: boolean
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

export interface RecurringTransaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: 'income' | 'expense'
  amount: number
  description: string
  day_of_month: number
  start_date: string
  end_date: string | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MonthlyBalance {
  id: string
  user_id: string
  year: number
  month: number
  label: string
  created_at: string
  updated_at: string
}

export interface FinancialEntry {
  id: string
  user_id: string
  monthly_balance_id: string
  account_id: string | null
  category_id: string | null
  entry_type: 'income' | 'expense'
  status: 'planned' | 'paid'
  description: string
  expected_amount: number
  actual_amount: number | null
  due_date: string
  paid_date: string | null
  source: 'manual' | 'recurring' | 'imported' | 'asaas'
  recurring_rule_id: string | null
  external_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecurringRule {
  id: string
  user_id: string
  account_id: string | null
  category_id: string | null
  entry_type: 'income' | 'expense'
  description: string
  amount: number
  day_of_month: number
  start_year: number
  start_month: number
  end_year: number | null
  end_month: number | null
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Budget {
  id: string
  user_id: string
  category_id: string
  year: number
  month: number
  planned_amount: number
  created_at: string
  updated_at: string
}

export interface SavingsGoal {
  id: string
  user_id: string
  name: string
  target_amount: number
  current_amount: number
  monthly_target: number
  deadline: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ImportHistory {
  id: string
  user_id: string
  account_id: string | null
  filename: string
  file_type: 'csv' | 'ofx' | 'pdf'
  bank: string
  total_transactions: number
  imported_transactions: number
  duplicated_transactions: number
  ignored_transactions: number
  status: 'processing' | 'completed' | 'error'
  error_message: string | null
  created_at: string
}

export interface IntegrationSetting {
  id: string
  user_id: string
  provider: 'asaas'
  enabled: boolean
  environment: 'sandbox' | 'production'
  default_account_id: string | null
  default_category_id: string | null
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface IntegrationSyncHistory {
  id: string
  user_id: string
  provider: 'asaas'
  environment: 'sandbox' | 'production'
  period_start: string
  period_end: string
  total_found: number
  imported_count: number
  duplicated_count: number
  ignored_count: number
  status: 'processing' | 'completed' | 'error'
  error_message: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at' | 'updated_at'>
        Update: Partial<Pick<Profile, 'full_name' | 'avatar_url'>>
        Relationships: []
      }
      accounts: {
        Row: Account
        Insert: Omit<Account, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      categories: {
        Row: Category
        Insert: Omit<Category, 'id' | 'created_at'>
        Update: Partial<Omit<Category, 'id' | 'created_at'>>
        Relationships: []
      }
      transactions: {
        Row: Transaction
        Insert: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Transaction, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      recurring_transactions: {
        Row: RecurringTransaction
        Insert: Omit<RecurringTransaction, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<RecurringTransaction, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      monthly_balances: {
        Row: MonthlyBalance
        Insert: Omit<MonthlyBalance, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<MonthlyBalance, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      financial_entries: {
        Row: FinancialEntry
        Insert: Omit<FinancialEntry, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<FinancialEntry, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      recurring_rules: {
        Row: RecurringRule
        Insert: Omit<RecurringRule, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<RecurringRule, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      budgets: {
        Row: Budget
        Insert: Omit<Budget, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Budget, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      savings_goals: {
        Row: SavingsGoal
        Insert: Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SavingsGoal, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      import_history: {
        Row: ImportHistory
        Insert: Omit<ImportHistory, 'id' | 'created_at'>
        Update: Partial<Omit<ImportHistory, 'id' | 'created_at'>>
        Relationships: []
      }
      integration_settings: {
        Row: IntegrationSetting
        Insert: Omit<IntegrationSetting, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<IntegrationSetting, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      integration_sync_history: {
        Row: IntegrationSyncHistory
        Insert: Omit<IntegrationSyncHistory, 'id' | 'created_at'>
        Update: Partial<Omit<IntegrationSyncHistory, 'id' | 'created_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      profile_role: 'admin' | 'user'
    }
    CompositeTypes: Record<string, never>
  }
}
