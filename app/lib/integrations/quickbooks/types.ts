/**
 * QuickBooks types for accounting objects.
 */

export interface QuickBooksTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  realmId?: string // QuickBooks company ID
}

export interface QuickBooksInvoice {
  Id: string
  DocNumber?: string
  CustomerRef?: { id: string; name?: string }
  Line?: Array<{
    Id?: string
    LineNum?: number
    Description?: string
    Amount: number
    DetailType: string
    LineDetailType?: string
    SalesItemLineDetail?: {
      Qty?: number
      UnitPrice?: number
      ItemRef?: { id: string; name?: string }
    }
  }>
  TotalAmt?: number
  Balance?: number
  DueDate?: string
  InvoiceDate?: string
  EmailStatus?: string
  status?: string // Open, Paid, Past due
}

export interface QuickBooksCustomer {
  Id: string
  DisplayName?: string
  PrimaryEmailAddr?: { Address?: string }
  PrimaryPhone?: { FreeFormNumber?: string }
  CompanyName?: string
  GivenName?: string
  FamilyName?: string
  CreatedTime?: string
  LastUpdatedTime?: string
}

export interface QuickBooksOAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  realmId?: string
}

export interface QuickBooksListResponse<T> {
  QueryResponse: {
    [entity: string]: T[]
  }
  'intuit-tid'?: string
}