-- Add gmail_address to gmail_tokens so we can route Gmail push notifications
-- to the correct user by matching the 'from' address in received emails.
ALTER TABLE gmail_tokens ADD COLUMN IF NOT EXISTS gmail_address TEXT;

CREATE INDEX IF NOT EXISTS gmail_tokens_gmail_address_idx ON gmail_tokens(gmail_address) WHERE gmail_address IS NOT NULL;