import { QueryClient, MutationCache } from '@tanstack/react-query';
import { notifyError } from '../stores/useToasts';

export const queryClient = new QueryClient({
  // One place that turns a failed write into a visible error, so no mutation
  // has to remember its own onError handler.
  mutationCache: new MutationCache({
    onError: (err, _vars, _onMutateResult, mutation) => {
      // `meta: { inline: true }` marks a mutation that renders the message itself
      // (the auth form), so a toast would only duplicate it.
      if (mutation.meta?.inline) return;
      notifyError(err);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

// Query failures are deliberately not toasted: queries render a dedicated error
// state, and a toast per background refetch would stack up on every poll.
