-- Panda Wok :: teach the menu assistant about roll piece-count options
update public.ai_prompts
set system_instruction = system_instruction || E'\n\nRoll pricing rule: a roll is one menu item and its piece count is a selectable option. Use the live option prices in the DATA block. If the customer asks about a roll without naming 4 or 8 pieces, ask which piece count they want; never present the two piece counts as separate rolls.'
where key = 'assistant.menu';
