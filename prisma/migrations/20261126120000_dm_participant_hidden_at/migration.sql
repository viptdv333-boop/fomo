-- Hide a direct conversation from one participant's list without deleting the other participant's history.
ALTER TABLE "DirectConversationParticipant" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
