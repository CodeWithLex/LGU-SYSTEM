-- =============================================
-- Sample Seed Data
-- COE Budget Transparency System
-- For development/testing purposes only
-- =============================================

-- NOTE: Profiles are auto-created via Auth trigger.
-- Manually seed an admin profile for testing:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@coe.edu';

-- Sample Events
INSERT INTO public.events (event_name, description, allocated_budget, remaining_budget, status, event_date)
VALUES
  ('Engineering Week 2026', 'Annual celebration of engineering excellence with competitions, exhibits, and cultural events.', 50000.00, 50000.00, 'ongoing', '2026-01-15'),
  ('Acquaintance Party', 'Welcome event for incoming COE freshmen.', 15000.00, 15000.00, 'upcoming', '2026-02-01'),
  ('COE Outreach Program', 'Community service program in partnership with local barangays.', 20000.00, 20000.00, 'upcoming', '2026-03-10'),
  ('Intramurals 2026', 'Inter-year level sports competition for COE students.', 25000.00, 25000.00, 'upcoming', '2026-04-20');

-- Sample Announcements
INSERT INTO public.announcements (title, body)
VALUES
  ('Engineering Week Budget Posted', 'The complete budget allocation for Engineering Week 2026 has been posted. Please review the financial dashboard for details.'),
  ('Receipt Submission Reminder', 'All officers must submit official receipts within 3 days of purchase. Digital uploads are now accepted via this system.');
