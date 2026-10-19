<form method="POST" action="/login">
    @csrf
    <input type="email" name="email" value="{{ old('email') }}" required>
    @error('email') <div>{{ $message }}</div> @enderror
    <input type="password" name="password" required>
    <button type="submit">Login</button>
</form>
