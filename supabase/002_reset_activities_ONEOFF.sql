-- ONE-OFF: clears all activities so a clean JSON backup can be re-imported as the new baseline.
-- Does NOT touch categories or app_settings.
delete from activities;
