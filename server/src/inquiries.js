"use strict";

const DAY_MS = 24 * 60 * 60 * 1000;

function pruneInquiryList(inquiries, policy, now = Date.now()) {
  const cutoff = now - policy.retentionDays * DAY_MS;
  return inquiries
    .map((inquiry, index) => ({ inquiry, index, time: Date.parse(inquiry.createdAt) }))
    .filter((entry) => Number.isFinite(entry.time) && entry.time >= cutoff)
    .sort((left, right) => right.time - left.time || right.index - left.index)
    .slice(0, policy.maxInquiries)
    .map((entry) => entry.inquiry);
}

function sameInquiryOrder(left, right) {
  return (
    left.length === right.length &&
    left.every((entry, index) => entry.id === right[index].id)
  );
}

async function pruneStoredInquiries(store, policy, now = Date.now()) {
  const current = store.readSections(["inquiries"]).inquiries;
  const preview = pruneInquiryList(current, policy, now);
  if (sameInquiryOrder(current, preview)) return 0;

  return store.update((draft) => {
    const before = draft.inquiries.length;
    draft.inquiries = pruneInquiryList(draft.inquiries, policy, now);
    return before - draft.inquiries.length;
  });
}

module.exports = {
  pruneInquiryList,
  pruneStoredInquiries,
};
