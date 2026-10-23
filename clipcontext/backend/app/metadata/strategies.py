"""The ten generation strategies per pool. Each candidate is generated against a distinct one."""

TITLE_STRATEGIES: dict[str, str] = {
    "question": "Ask the question the clip answers.",
    "bold_claim": "State the clip's strongest claim plainly.",
    "curiosity_gap": "Reveal enough to intrigue, hold back the payoff (no false promises).",
    "number_led": "Lead with a specific number that appears in the evidence.",
    "story": "Frame it as a short first-person or narrative moment.",
    "how_to": "Promise the practical outcome the clip teaches.",
    "contrarian": "Contrast the common belief with what the clip says.",
    "emotional": "Lead with the feeling or stakes in the clip.",
    "seo_keyword": "Put the main search phrase of the niche first, plain and clear.",
    "creator_voice": "Sound like the speaker, using their own words where possible.",
}

DESCRIPTION_STRATEGIES: dict[str, str] = {
    "hook_summary": "Hook line, then one-sentence summary.",
    "key_takeaways": "Hook line, then 2-3 short takeaway lines.",
    "question_engage": "Open with a question to the viewer and invite comments.",
    "story_tease": "Tease the story without spoiling the ending.",
    "seo_rich": "Natural sentences that include the niche's search phrases.",
    "minimal": "One strong line plus hashtags.",
    "value_list": "What the viewer will learn, as a compact list.",
    "quote_led": "Open with the most quotable line actually spoken.",
    "cta_focused": "Summary plus a clear, honest call to action.",
    "context_explainer": "Give the context a new viewer needs, then the point.",
}

HASHTAG_STRATEGIES: dict[str, str] = {
    "broad_reach": "Mostly broad, high-volume hashtags of the niche.",
    "niche_specific": "Mostly specific hashtags for the exact topic.",
    "trending_mix": "Mix of hashtags seen in the benchmark and topic hashtags.",
    "topic_entity": "Hashtags for named people, products, places in the evidence.",
    "community": "Hashtags the niche's community uses to find each other.",
    "minimal_3": "Exactly three strong hashtags.",
    "long_tail": "Longer, specific search phrases as hashtags and tags.",
    "question_intent": "Tags that match questions people search for.",
    "format_signal": "Include format hashtags (#shorts, #reels) plus topic.",
    "balanced": "Balanced set: 1 broad, 2 niche, 1 entity, 1 format.",
}

STRATEGIES = {"title": TITLE_STRATEGIES, "description": DESCRIPTION_STRATEGIES, "hashtags": HASHTAG_STRATEGIES}
